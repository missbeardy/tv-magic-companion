// api/inbound-sms.ts – fixed with org mapping
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'
import { checkRateLimit } from './_rateLimit'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function verifyTwilioSignature(req: VercelRequest, authToken: string): boolean {
  const twilioSig = req.headers['x-twilio-signature'] as string
  if (!twilioSig) return false
  const url = `https://${req.headers.host}${req.url}`
  const params = req.body as Record<string, string>
  const sortedParamString = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url)
  const expectedSig = createHmac('sha1', authToken).update(sortedParamString).digest('base64')
  try {
    return timingSafeEqual(Buffer.from(twilioSig), Buffer.from(expectedSig))
  } catch { return false }
}

async function parseSmsWithClaude(smsText: string, fromNumber: string) {
  const prompt = `You are a CRM data extractor. Extract fields from this SMS. Return ONLY valid JSON: {"customer_name":"","phone":"","service_type":"","job_details":"","address":""}`
  // (full prompt as in original – shortened for brevity)
  // ... keep your existing parse function
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown'
  if (!checkRateLimit(ip, 60, 60000)) return res.status(429).send('<Response></Response>')
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return res.status(500).json({ error: 'Missing Twilio auth' })
  if (!verifyTwilioSignature(req, authToken)) return res.status(403).json({ error: 'Invalid signature' })

  try {
    const body = req.body as Record<string, string>
    const smsText = body.Body || ''
    const fromNumber = body.From || ''
    if (!smsText.trim()) return res.status(200).send('<Response></Response>')

    const parsed = await parseSmsWithClaude(smsText, fromNumber) // implement as before
    if (!parsed) return res.status(200).send('<Response></Response>')

    // 🆕 Determine org_id from the incoming phone number (Twilio "To" number)
    const toNumber = body.To || ''
    let orgId = null
    if (toNumber) {
      const { data: mapping } = await supabase
        .from('org_phone_numbers')
        .select('org_id')
        .eq('phone_number', toNumber.replace(/\s+/g, ''))
        .maybeSingle()
      orgId = mapping?.org_id || process.env.DEFAULT_ORG_ID || null
    }

    const { error } = await supabase.from('leads').insert({
      name: parsed.customer_name || 'SMS Enquiry',
      phone: parsed.phone || fromNumber,
      service_type: parsed.service_type || 'Other',
      details: parsed.job_details || smsText,
      address: parsed.address || '',
      status: 'unassigned',
      source: 'sms',
      org_id: orgId,
      created_at: new Date().toISOString(),
    })

    if (error) console.error('Insert error:', error)
    return res.status(200).send('<Response></Response>')
  } catch (err) {
    console.error(err)
    return res.status(200).send('<Response></Response>')
  }
}