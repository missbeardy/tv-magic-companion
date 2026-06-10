import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from './_rateLimit'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── FEAT-01: Input Sanitisation ─────────────────────────────────────────────
// Claude's output is treated as untrusted. We validate every field before
// it touches the database to guard against prompt injection and bad data.

const VALID_SERVICE_TYPES = [
  'TV Aerial',
  'Satellite Dish',
  'CCTV',
  'Sky Q',
  'Sky Glass',
  'Freesat',
  'Other',
]

function sanitiseParsedLead(raw: Record<string, unknown>) {
  return {
    name: String(raw.customer_name ?? '').slice(0, 200) || 'Unknown',
    phone: String(raw.phone ?? '').replace(/[^0-9+\-\s()]/g, '').slice(0, 20),
    service_type: VALID_SERVICE_TYPES.includes(String(raw.service_type))
      ? String(raw.service_type)
      : 'Other',
    details: String(raw.job_details ?? '').slice(0, 2000),
    address: String(raw.address ?? '').slice(0, 500),
  }
}

// ─── Claude Email Parser ──────────────────────────────────────────────────────
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

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // SEC-08: Rate limit — 60 req/min for webhook source IPs (Cloudmailin)
  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown'
  if (!checkRateLimit(ip, 60, 60_000)) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  try {
    const body = req.body as Record<string, string>

    const rawText = body['plain'] || body['html'] || body.body || ''

    if (!rawText) {
      console.error('No email text in payload:', Object.keys(body))
      return res.status(200).json({ skipped: true, reason: 'no_text' })
    }

    const parsed = await parseEmailWithClaude(rawText)

    if (!parsed) {
      return res.status(200).json({ skipped: true, reason: 'parse_failed' })
    }

    // FEAT-01: Sanitise before insert — never trust Claude's raw output
    const sanitised = sanitiseParsedLead(parsed)

    const { error } = await supabase.from('leads').insert({
      ...sanitised,
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