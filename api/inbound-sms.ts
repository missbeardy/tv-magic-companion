// api/inbound-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'
import { checkRateLimit } from './_rateLimit'

// Initialize Supabase with SERVICE ROLE key (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper: Verify Twilio signature
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

// Claude parser (simplified, robust)
async function parseSmsWithClaude(smsText: string, fromNumber: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const prompt = `You are a CRM extractor. Return ONLY valid JSON. No markdown, no extra text.
Extract from this SMS:
"${smsText}"

Fields:
- customer_name (string, default "SMS Enquiry")
- phone (string, use "${fromNumber}" if not mentioned)
- service_type (one of: "TV Aerial", "Satellite Dish", "CCTV", "Sky Q", "Sky Glass", "Freesat", "Other", default "Other")
- job_details (string, summary)
- address (string, empty if not mentioned)

Response format: {"customer_name":"...","phone":"...","service_type":"...","job_details":"...","address":"..."}`

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
    const data = await response.json()
    const raw = data.content?.[0]?.text || ''
    const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()
    return JSON.parse(cleaned)
  } catch (err) {
    console.error('Claude parse error:', err)
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Rate limit
  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown'
  if (!checkRateLimit(ip, 60, 60000)) {
    res.setHeader('Content-Type', 'text/xml')
    return res.status(429).send('<Response></Response>')
  }

  // Twilio auth
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('TWILIO_AUTH_TOKEN missing')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }
  if (!verifyTwilioSignature(req, authToken)) {
    console.warn('Invalid Twilio signature')
    return res.status(403).json({ error: 'Invalid signature' })
  }

  try {
    const body = req.body as Record<string, string>
    const smsText = body.Body || ''
    const fromNumber = body.From || ''
    const toNumber = body.To || ''  // Your Twilio number

    if (!smsText.trim()) {
      return res.status(200).send('<Response></Response>')
    }

    // Parse with Claude (fallback to raw text if Claude fails)
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

    // Determine org_id from the called number (To)
    let orgId = null
    if (toNumber) {
      const normalizedTo = toNumber.replace(/\s+/g, '')
      const { data: mapping } = await supabase
        .from('org_phone_numbers')
        .select('org_id')
        .eq('phone_number', normalizedTo)
        .maybeSingle()
      orgId = mapping?.org_id || process.env.DEFAULT_ORG_ID || null
    } else {
      orgId = process.env.DEFAULT_ORG_ID || null
    }

    // Insert lead
    const { error: insertError } = await supabase
      .from('leads')
      .insert({
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

    if (insertError) {
      console.error('Supabase insert error:', insertError)
      // Still return 200 to Twilio so they don't retry
    }

    // Always return TwiML success
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  } catch (err) {
    console.error('Unhandled error:', err)
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }
}