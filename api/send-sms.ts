// api/send-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from './_lib/auth.js'
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
