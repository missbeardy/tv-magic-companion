import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Optional: verify the request is genuinely from Mailgun
function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string
): boolean {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY
  if (!signingKey) return true // skip verification if key not set

  const value = timestamp + token
  const expectedSig = createHmac('sha256', signingKey)
    .update(value)
    .digest('hex')

  return expectedSig === signature
}

async function parseEmailWithClaude(rawEmail: string) {
  const prompt = `You are a CRM data extractor for a TV aerial and satellite installation business.

Extract the following fields from this inbound customer email. Return ONLY valid JSON — no markdown, no explanation, no backticks.

Fields:
- customer_name (string)
- phone (string, empty string if not found)
- service_type (string, one of: "TV Aerial", "Satellite Dish", "CCTV", "Sky Q", "Sky Glass", "Freesat", "Other")
- job_details (string, 1-2 sentence summary)
- address (string, empty string if not found)

Email:
---
${rawEmail}
---

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
  const raw =
    data.content
      ?.map((b: { type: string; text?: string }) =>
        b.type === 'text' ? b.text : ''
      )
      .join('') ?? ''
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    console.error('Claude returned unparseable JSON:', cleaned)
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body as Record<string, string>

    // Optional Mailgun signature verification
    const { timestamp, token, signature } = body
    if (timestamp && token && signature) {
      if (!verifyMailgunSignature(timestamp, token, signature)) {
        console.error('Mailgun signature verification failed')
        return res.status(403).json({ error: 'Invalid signature' })
      }
    }

    // Mailgun field names use hyphens — stripped-text removes quoted reply chains
    const rawText =
      body['stripped-text'] ||
      body['body-plain'] ||
      body.text ||
      body.html ||
      body.body ||
      ''

    if (!rawText) {
      console.error('No email text in payload:', Object.keys(body))
      return res.status(200).json({ skipped: true, reason: 'no_text' })
    }

    const parsed = await parseEmailWithClaude(rawText)

    if (!parsed) {
      return res.status(200).json({ skipped: true, reason: 'parse_failed' })
    }

    const { error } = await supabase.from('leads').insert({
      name: parsed.customer_name || 'Unknown',
      phone: parsed.phone || '',
      service_type: parsed.service_type || 'Other',
      details: parsed.job_details || '',
      address: parsed.address || '',
      status: 'unassigned',
      source: 'email_webhook',
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error('Supabase insert error:', error)
      return res.status(500).json({ error: 'DB insert failed' })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Inbound email handler error:', err)
    return res.status(200).json({ skipped: true, reason: 'exception' })
  }
}