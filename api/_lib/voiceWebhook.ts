// T1.20 — voice-provider webhooks for forwarded missed calls.
// Routed as `/api/inbound-sms?action=voice&provider=<name>` (hub reuse; 12-function cap).
//
// Provider decision (owner, 01-10-2026): trial Crazytel first, fall back to Twilio.
// Crazytel's voicemail webhook payload is not publicly documented, so its branch starts
// in CAPTURE mode: it logs the shape of what arrives (numbers masked) and writes nothing.
// Once real payloads are in hand, a parser turns them into a ForwardedCallEvent and
// calls handleForwardedCall — see the T1.20 go/no-go checklist in ROADMAP.md.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkRateLimit, rateLimitIdentifier } from './rateLimit.js'
import { log } from './log.js'

const CAPTURE_BODY_LIMIT = 4000

/** Mask anything that looks like a phone number so capture logs carry no caller PII. */
export function maskPhoneLikeDigits(text: string): string {
  return text.replace(/\+?\d[\d\s-]{6,}\d/g, (m) => {
    const digits = m.replace(/\D/g, '')
    return `…${digits.slice(-3)}`
  })
}

/** Header names + values, minus anything credential-shaped. */
export function captureHeaders(headers: VercelRequest['headers']): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (/^(authorization|cookie|x-vercel-|x-forwarded-for|x-real-ip)/i.test(name)) continue
    const v = Array.isArray(value) ? value.join(', ') : String(value ?? '')
    out[name] = /signature/i.test(name) ? `<${v.length} chars>` : v
  }
  return out
}

async function handleCrazytelCapture(
  req: VercelRequest,
  res: VercelResponse,
  rawBody: string
): Promise<VercelResponse | void> {
  log.info('Crazytel webhook captured (capture mode — nothing processed)', {
    method: req.method,
    query: req.query,
    headers: captureHeaders(req.headers),
    bodyLength: rawBody.length,
    body: maskPhoneLikeDigits(rawBody.slice(0, CAPTURE_BODY_LIMIT)),
  })
  return res.status(200).json({ received: true })
}

export async function handleVoiceWebhook(
  req: VercelRequest,
  res: VercelResponse,
  _supabase: SupabaseClient,
  rawBody: string
): Promise<VercelResponse | void> {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const allowed = await checkRateLimit({
    scope: 'inbound-voice',
    identifier: rateLimitIdentifier(req.headers),
    limit: 60,
    windowMs: 60_000,
  })
  if (!allowed) return res.status(429).json({ error: 'Too many requests' })

  const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined
  switch (provider) {
    case 'crazytel':
      return handleCrazytelCapture(req, res, rawBody)
    default:
      return res.status(404).json({ error: 'Unknown voice provider' })
  }
}
