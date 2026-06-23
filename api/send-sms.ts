// api/send-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, type AuthContext } from './_lib/auth.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { buildSmsFromBrand } from './_lib/smsTemplates.js'
import { getPlatformUrl } from './_lib/platformUrl.js'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

/** Candidate formats for an AU phone so DB lookups match regardless of stored format. */
function phoneCandidates(input: string): string[] {
  const digits = input.replace(/[^0-9+]/g, '')
  const set = new Set<string>([input.trim(), digits])
  let national = digits.replace(/^\+?61/, '0').replace(/^\+/, '')
  if (national && !national.startsWith('0')) national = '0' + national
  if (national) {
    set.add(national)
    set.add('+61' + national.slice(1))
    set.add('61' + national.slice(1))
  }
  return [...set].filter(Boolean)
}

/** True if `to` belongs to a lead or customer in the caller's org. */
async function phoneBelongsToOrg(to: string, orgId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return false
  const candidates = phoneCandidates(to)

  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('org_id', orgId)
    .in('phone', candidates)
    .limit(1)
    .maybeSingle()
  if (lead) return true

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('org_id', orgId)
    .in('phone', candidates)
    .limit(1)
    .maybeSingle()
  return Boolean(customer)
}

/** True if `to` is the phone of a team member (technician/manager) in the org. */
async function technicianInOrg(to: string, orgId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return false
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .in('phone', phoneCandidates(to))
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}

/** Push notification via OneSignal — only to users inside the caller's org. */
async function handleNotify(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { userId, title, message, url } = req.body as {
    userId?: string
    title?: string
    message?: string
    url?: string
  }

  if (!userId || !title || !message) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ error: 'Server not configured' })
  }

  const { data: target, error: targetError } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .maybeSingle()

  if (targetError || !target || target.org_id !== auth.orgId) {
    return res.status(403).json({ error: 'Cannot notify a user outside your organisation' })
  }

  const appId = process.env.ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_API_KEY
  if (!appId || !apiKey) {
    return res.status(500).json({ error: 'OneSignal not configured' })
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        target_channel: 'push',
        include_aliases: { external_id: [userId] },
        headings: { en: title },
        contents: { en: message },
        url: url || `${getPlatformUrl()}/leads`,
      }),
    })

    const data = (await response.json()) as { id?: string; errors?: unknown }
    if (!response.ok) {
      console.error('OneSignal error:', data)
      return res.status(500).json({ error: 'Failed to send notification', details: data })
    }

    return res.status(200).json({ success: true, id: data.id })
  } catch (err) {
    console.error('send-notification error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticateRequest(req)
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const ip = (req.headers['x-forwarded-for'] as string) ?? auth.userId
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  // Consolidated to stay under the Vercel Hobby 12-function limit.
  // /api/send-notification rewrites here with ?action=notify (see vercel.json).
  if (req.query.action === 'notify') {
    return handleNotify(req, res, auth)
  }

  const { mode, to, customerName, techName, address, leadName, serviceType } = req.body as {
    mode?: string
    to: string
    customerName?: string
    techName?: string
    address?: string
    leadName?: string
    serviceType?: string
  }

  if (!to) {
    return res.status(400).json({ error: 'Missing required field: to' })
  }

  // Only allow texting numbers that exist on a lead/customer in the caller's org.
  // For tech_assignment / manager_alert, `to` is a team member — allow org members too.
  const isInternalMode = mode === 'tech_assignment' || mode === 'manager_alert'
  const allowed =
    (isInternalMode && (await technicianInOrg(to, auth.orgId))) ||
    (await phoneBelongsToOrg(to, auth.orgId))

  if (!allowed) {
    return res.status(400).json({ error: 'Recipient is not a contact in your organisation' })
  }

  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER

  if (!sid || !token || !from) {
    return res.status(500).json({ error: 'Twilio env vars not configured' })
  }

  const orgName = auth.org.name
  const platformUrl = getPlatformUrl()
  let message: string

  if (mode === 'tech_assignment') {
    if (!leadName || !serviceType) {
      return res.status(400).json({ error: 'Missing leadName or serviceType for tech_assignment mode' })
    }
    message = buildSmsFromBrand(
      auth.brand?.sms_templates,
      'tech_assignment',
      {
        'org.name': orgName,
        leadName,
        serviceType,
        appUrl: `${platformUrl}/leads`,
      },
      `${orgName}: You've been assigned {{leadName}} ({{serviceType}}). Open the app: {{appUrl}}`
    )
  } else if (mode === 'manager_alert') {
    if (!leadName || !serviceType) {
      return res.status(400).json({ error: 'Missing leadName or serviceType for manager alert' })
    }
    message = buildSmsFromBrand(
      auth.brand?.sms_templates,
      'manager_alert',
      {
        'org.name': orgName,
        leadName,
        serviceType,
        appUrl: `${platformUrl}/leads`,
      },
      `${orgName}: A new lead has been submitted — {{leadName}} ({{serviceType}}). Please review and assign a technician: {{appUrl}}`
    )
  } else {
    if (!customerName || !address) {
      return res.status(400).json({ error: 'Missing customerName or address for ETA mode' })
    }
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`
    message = buildSmsFromBrand(
      auth.brand?.sms_templates,
      'customer_ontheway',
      {
        'org.name': orgName,
        customerName,
        techName: techName ?? 'your technician',
        serviceType: serviceType ?? 'service',
        mapsUrl,
      },
      `Hi {{customerName}}, {{techName}} from {{org.name}} is on their way. Track the route: {{mapsUrl}}`
    )
  }

  const bodyParams = new URLSearchParams({ To: to, From: from, Body: message })
  const credentials = Buffer.from(`${sid}:${token}`).toString('base64')

  try {
    const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    })

    const twData = await twRes.json()

    if (!twRes.ok) {
      console.error('Twilio error:', twData)
      return res.status(502).json({ error: 'Twilio rejected the request', detail: (twData as { message?: string }).message })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('SMS send error:', err)
    return res.status(500).json({ error: 'Failed to send SMS' })
  }
}
