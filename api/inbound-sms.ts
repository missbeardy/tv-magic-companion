// api/inbound-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'

// Simple in-memory rate limiter (60 requests per minute per IP)
const requests = new Map<string, { count: number; reset: number }>()

function checkRateLimit(ip: string, limit = 60, windowMs = 60000): boolean {
  const now = Date.now()
  const key = ip.split(',')[0].trim() || 'unknown'
  const entry = requests.get(key)
  if (!entry || now > entry.reset) {
    requests.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function verifyTwilioSignature(req: VercelRequest, authToken: string): boolean {
  const twilioSig = req.headers['x-twilio-signature'] as string
  if (!twilioSig) return false
  const url = `https://${req.headers.host}${req.url}`
  const params = req.body as Record<string, string>
  const sortedParams = Object.keys(params).sort().map(k => k + params[k]).join('')
  const signatureBase = url + sortedParams
  const expectedSig = createHmac('sha1', authToken).update(signatureBase).digest('base64')
  try {
    return timingSafeEqual(Buffer.from(twilioSig), Buffer.from(expectedSig))
  } catch {
    return false
  }
}

async function parseSmsWithClaude(smsText: string, fromNumber: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const prompt = `Extract from this SMS. Return ONLY valid JSON. No markdown.
SMS: "${smsText.substring(0, 800)}"
Fields:
- customer_name (string, default "SMS Enquiry")
- phone (string, use "${fromNumber}")
- service_type (string, one of: "TV Aerial","Satellite Dish","CCTV","Other", default "Other")
- job_details (string)
- address (string)

Response: {"customer_name":"...","phone":"...","service_type":"...","job_details":"...","address":"..."}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) return null
    const data = await response.json() as { content?: Array<{ text?: string }> }
    const raw = data.content?.[0]?.text || ''
    const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown'
  if (!checkRateLimit(ip)) {
    console.warn('Rate limit hit for', ip)
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('Missing TWILIO_AUTH_TOKEN')
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }

  if (!verifyTwilioSignature(req, authToken)) {
    console.warn('Invalid Twilio signature')
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }

  try {
    const body = req.body as Record<string, string>
    const smsText = body.Body || ''
    const fromNumber = body.From || ''
    const toNumber = body.To || ''

    if (!smsText.trim()) {
      console.log('Empty SMS')
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    console.log(`SMS from ${fromNumber} to ${toNumber}: ${smsText.substring(0, 100)}`)

    let parsed = await parseSmsWithClaude(smsText, fromNumber)
    if (!parsed) {
      parsed = {
        customer_name: 'SMS Enquiry',
        phone: fromNumber,
        service_type: 'Other',
        job_details: smsText,
        address: '',
      }
    }

    let orgId: string | null = null
    if (toNumber) {
      const normalizedTo = toNumber.replace(/\s+/g, '')
      const { data: mapping } = await supabase
        .from('org_phone_numbers')
        .select('org_id')
        .eq('phone_number', normalizedTo)
        .maybeSingle()
      orgId = mapping?.org_id || null
    }

    if (!orgId && process.env.DEFAULT_ORG_ID) {
      orgId = process.env.DEFAULT_ORG_ID
    }

    if (!orgId) {
      console.error('No org_id found – lead will be rejected by RLS')
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    const { error } = await supabase.from('leads').insert({
      name: parsed.customer_name,
      phone: parsed.phone,
      service_type: parsed.service_type,
      details: parsed.job_details,
      address: parsed.address,
      status: 'unassigned',
      source: 'sms',
      org_id: orgId,
      raw_sms: JSON.stringify(body),
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error('Insert error:', error)
    } else {
      console.log('Lead saved')
    }

    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  } catch (err) {
    console.error('Unhandled error:', err)
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }
}