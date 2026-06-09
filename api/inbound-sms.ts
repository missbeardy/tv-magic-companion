import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl!, supabaseKey!)

// ─── Twilio Signature Verification ───────────────────────────────────────────
// Twilio signs every webhook with your Auth Token. We recreate the expected
// signature and compare using timingSafeEqual to prevent timing attacks.
function verifyTwilioSignature(req: VercelRequest, authToken: string): boolean {
  const twilioSig = req.headers['x-twilio-signature'] as string
  if (!twilioSig) return false

  // Reconstruct the full URL Twilio signed
  const url = `https://${req.headers.host}${req.url}`

  // Sort params alphabetically and concatenate: url + key1value1 + key2value2...
  const params = req.body as Record<string, string>
  const sortedParamString = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url)

  // Create the expected signature using HMAC-SHA1
  const expectedSig = createHmac('sha1', authToken)
    .update(sortedParamString)
    .digest('base64')

  // Compare byte-by-byte in constant time to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(twilioSig),
      Buffer.from(expectedSig)
    )
  } catch {
    // timingSafeEqual throws if buffers differ in length — treat as invalid
    return false
  }
}

// ─── Claude SMS Parser ────────────────────────────────────────────────────────
async function parseSmswithClaude(smsText: string, fromNumber: string) {
  const prompt = `You are a CRM data extractor for a TV aerial and satellite installation business.

A customer has sent the following SMS enquiry. Extract what you can. Return ONLY valid JSON — no markdown, no explanation, no backticks.

Fields:
- customer_name (string, use "SMS Enquiry" if no name given)
- phone (string, use the from number provided if not mentioned in message)
- service_type (string, one of: "TV Aerial", "Satellite Dish", "CCTV", "Sky Q", "Sky Glass", "Freesat", "Other")
- job_details (string, summary of what they need — use the raw message if nothing clear)
- address (string, empty string if not mentioned)

From number: ${fromNumber}
SMS message: ${smsText}

Return JSON only.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = (await response.json()) as any
  const raw = data.content
    ?.map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text : ''))
    .join('') ?? ''
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    console.error('Claude returned unparseable JSON:', cleaned)
    return null
  }
}

// ─── Manager Notifications ────────────────────────────────────────────────────
async function notifyManagers(leadName: string, serviceType: string, fromNumber: string) {
  const { data: managers } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'manager')

  if (!managers?.length) return

  const notifications = managers.map((m) => ({
    user_id: m.id,
    title: 'New SMS Lead',
    message: `${leadName} enquired about ${serviceType} (from ${fromNumber})`,
    type: 'new_lead',
    read: false,
    created_at: new Date().toISOString(),
  }))

  await supabase.from('notifications').insert(notifications)
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ✅ Verify the request genuinely came from Twilio before doing anything else
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('TWILIO_AUTH_TOKEN is not set')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  if (!verifyTwilioSignature(req, authToken)) {
    console.warn('Rejected request with invalid Twilio signature')
    return res.status(403).json({ error: 'Invalid Twilio signature' })
  }

  try {
    const body = req.body as Record<string, string>
    const smsText = body.Body || ''
    const fromNumber = body.From || 'Unknown'

    if (!smsText.trim()) {
      return res.status(200).send('<Response></Response>')
    }

    const parsed = await parseSmswithClaude(smsText, fromNumber)

    if (!parsed) {
      return res.status(200).send('<Response></Response>')
    }

    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        name: parsed.customer_name || 'SMS Enquiry',
        phone: parsed.phone || fromNumber,
        service_type: parsed.service_type || 'Other',
        details: parsed.job_details || smsText,
        address: parsed.address || '',
        status: 'unassigned',
        source: 'sms',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return res.status(200).send('<Response></Response>')
    }

    await notifyManagers(
      parsed.customer_name || 'SMS Enquiry',
      parsed.service_type || 'Other',
      fromNumber
    )

    console.log('SMS lead created:', newLead?.id)

    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')

  } catch (err) {
    console.error('Inbound SMS handler error:', err)
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }
}