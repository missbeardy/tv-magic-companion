// api/send-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, type AuthContext } from './_lib/auth.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { buildSmsFromBrand } from './_lib/smsTemplates.js'
import { getPlatformUrl } from './_lib/platformUrl.js'
import { notifyManagersNewLead } from './_lib/notifyManagersNewLead.js'
import { formatAuPhoneForSms, phoneCandidates } from './_lib/phone.js'

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

/**
 * Notify a user inside the caller's org:
 *  1. Inserts a row into `notifications` (feeds the in-app bell — service role
 *     bypasses the user_id=auth.uid() RLS so a manager can notify an employee).
 *  2. Best-effort OneSignal device push.
 */
async function handleNotify(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { userId, title, message, url, type, leadId } = req.body as {
    userId?: string
    title?: string
    message?: string
    url?: string
    type?: string
    leadId?: string
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

  // 1. In-app bell notification (DB row). This is what the bell reads.
  const { error: insertError } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type: type ?? 'lead_assigned',
    read: false,
    org_id: auth.orgId,
    ...(leadId ? { lead_id: leadId } : {}),
    created_at: new Date().toISOString(),
  })
  if (insertError) {
    console.error('Notification insert failed:', insertError)
    return res.status(500).json({ error: 'Failed to record notification' })
  }

  // 2. Best-effort device push (don't fail the request if OneSignal is down).
  const appId = process.env.ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_API_KEY
  if (appId && apiKey) {
    try {
      await fetch('https://onesignal.com/api/v1/notifications', {
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
    } catch (err) {
      console.error('OneSignal push failed (non-fatal):', err)
    }
  }

  return res.status(200).json({ success: true })
}

/** Alert managers after a new unassigned lead is created from the app. */
async function handleNewLeadAlert(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { leadId } = req.body as { leadId?: string }
  if (!leadId) {
    return res.status(400).json({ error: 'Missing leadId' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ error: 'Server not configured' })
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, org_id, name, service_type, status')
    .eq('id', leadId)
    .maybeSingle()

  if (leadError || !lead) {
    return res.status(404).json({ error: 'Lead not found' })
  }
  if (lead.org_id !== auth.orgId) {
    return res.status(403).json({ error: 'Lead is outside your organisation' })
  }

  try {
    const result = await notifyManagersNewLead(lead)
    if (result.skipped) {
      return res.status(200).json({ skipped: true, reason: result.skipped })
    }
    return res.status(200).json({ success: true, notified: result.notified })
  } catch (err) {
    console.error('New lead alert failed:', err)
    return res.status(500).json({ error: 'Failed to alert managers' })
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
  if (req.query.action === 'new-lead-alert') {
    return handleNewLeadAlert(req, res, auth)
  }

  const { mode, to, customerName, techName, address, leadName, serviceType, leadId } = req.body as {
    mode?: string
    to: string
    customerName?: string
    techName?: string
    address?: string
    leadName?: string
    serviceType?: string
    leadId?: string
  }

  if (!to && mode !== 'review_request') {
    return res.status(400).json({ error: 'Missing required field: to' })
  }

  const supabaseAdmin = getSupabaseAdmin()

  let smsTo = to ? formatAuPhoneForSms(to) : ''

  // Review requests: resolve phone from lead row (avoids format mismatch in phoneBelongsToOrg).
  if (mode === 'review_request') {
    if (!leadId) {
      return res.status(400).json({ error: 'Missing leadId for review_request mode' })
    }
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Server not configured' })
    }
    const { data: leadRow, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, org_id, phone, name')
      .eq('id', leadId)
      .maybeSingle()

    if (leadError || !leadRow) {
      return res.status(404).json({ error: 'Lead not found' })
    }
    if (leadRow.org_id !== auth.orgId) {
      return res.status(403).json({ error: 'Lead is outside your organisation' })
    }
    if (!leadRow.phone?.trim()) {
      return res.status(400).json({ error: 'Lead has no phone number' })
    }
    smsTo = formatAuPhoneForSms(leadRow.phone)
  }

  if (!smsTo) {
    return res.status(400).json({ error: 'Missing required field: to' })
  }

  // Only allow texting numbers that exist on a lead/customer in the caller's org.
  // For tech_assignment / manager_alert, `to` is a team member — allow org members too.
  const isInternalMode = mode === 'tech_assignment' || mode === 'manager_alert'
  const allowed =
    mode === 'review_request' ||
    (isInternalMode && (await technicianInOrg(smsTo, auth.orgId))) ||
    (await phoneBelongsToOrg(smsTo, auth.orgId))

  if (!allowed) {
    return res.status(400).json({ error: 'Recipient is not a contact in your organisation' })
  }

  if (mode === 'review_request' && !auth.org.review_requests_enabled) {
    return res.status(400).json({ error: 'Review requests are disabled for this organisation' })
  }

  const reviewUrl = auth.org.google_review_url?.trim()
  if (mode === 'review_request' && !reviewUrl) {
    return res.status(400).json({ error: 'Google review URL is not configured' })
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
  } else if (mode === 'review_request') {
    if (!customerName) {
      return res.status(400).json({ error: 'Missing customerName for review_request mode' })
    }
    message = buildSmsFromBrand(
      auth.brand?.sms_templates,
      'customer_review_request',
      {
        'org.name': orgName,
        customerName,
        reviewUrl: reviewUrl!,
      },
      `Hi {{customerName}}, thanks for choosing {{org.name}}! We'd love your feedback: {{reviewUrl}}`
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

  const bodyParams = new URLSearchParams({ To: smsTo, From: from, Body: message })
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
