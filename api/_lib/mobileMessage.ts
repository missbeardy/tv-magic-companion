import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto'

/**
 * Mobile Message (mobilemessage.com.au) adapter — T1.18.
 *
 * Transport, webhook crypto and payload parsing. No org lookups (the dedupe claim takes
 * a Supabase client as an argument). The provider-neutral entry point
 * that reads `orgs.sms_provider` is `sendOrgSms` in ./smsSend.ts; the inbound webhook lives
 * on the existing `api/inbound-sms.ts` hub as `?provider=mm` (12-function Vercel cap).
 */

export const MOBILE_MESSAGE_API_URL = 'https://api.mobilemessage.com.au/v1/messages'

/** Mobile Message says to reject a webhook whose X-MM-Timestamp is > 5 minutes off our clock. */
export const MOBILE_MESSAGE_SIGNATURE_TOLERANCE_SEC = 300

export interface MobileMessageSendResult {
  sent: boolean
  /** Mobile Message `message_id` (UUID). Stored in the existing `twilio_sid` columns. */
  sid?: string
  skipped?: string
  error?: string
}

/** Mobile Message documents numbers as `0412345678` or `61412345678` — never with a `+`. */
export function toMobileMessageNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) return `61${digits.slice(1)}`
  return digits
}

export function isMobileMessageConfigured(): boolean {
  return Boolean(
    process.env.MOBILE_MESSAGE_API_USERNAME?.trim() && process.env.MOBILE_MESSAGE_API_PASSWORD?.trim()
  )
}

interface MobileMessageApiResult {
  status?: string
  message_id?: string
  error?: string
}

interface MobileMessageApiResponse {
  status?: string
  error?: string
  message?: string
  results?: MobileMessageApiResult[]
}

const RETRY_DELAY_MS = 400

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * POST one SMS to Mobile Message.
 *
 * - `enable_unicode: true` always: without it Mobile Message silently STRIPS emoji and smart
 *   quotes rather than failing, which is how a "🙂 on our way" text would arrive mangled.
 * - One `Idempotency-Key` per logical send, reused on the single retry below, so a network
 *   error or 429/5xx retry can never double-send.
 * - A 200 is not "sent": the per-message `results[].status` can be `error` or `blocked`
 *   (the recipient unsubscribed on Mobile Message's side).
 */
export async function postMobileMessageSms(input: {
  from: string
  to: string
  body: string
  idempotencyKey?: string
  retryDelayMs?: number
}): Promise<MobileMessageSendResult> {
  const username = process.env.MOBILE_MESSAGE_API_USERNAME?.trim()
  const password = process.env.MOBILE_MESSAGE_API_PASSWORD?.trim()
  if (!username || !password) {
    return { sent: false, skipped: 'Mobile Message not configured' }
  }

  const idempotencyKey = input.idempotencyKey ?? randomUUID()
  const credentials = Buffer.from(`${username}:${password}`).toString('base64')
  const payload = JSON.stringify({
    enable_unicode: true,
    messages: [
      {
        to: toMobileMessageNumber(input.to),
        message: input.body,
        sender: toMobileMessageNumber(input.from),
      },
    ],
  })

  const attempt = () =>
    fetch(MOBILE_MESSAGE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: payload,
    })

  let res: Response
  try {
    res = await attempt()
    if (isRetryableStatus(res.status)) {
      await new Promise((resolve) => setTimeout(resolve, input.retryDelayMs ?? RETRY_DELAY_MS))
      res = await attempt()
    }
  } catch (firstErr) {
    try {
      await new Promise((resolve) => setTimeout(resolve, input.retryDelayMs ?? RETRY_DELAY_MS))
      res = await attempt()
    } catch (err) {
      console.error('Mobile Message SMS send failed:', err ?? firstErr)
      return { sent: false, error: 'Failed to send SMS' }
    }
  }

  let data: MobileMessageApiResponse = {}
  try {
    data = (await res.json()) as MobileMessageApiResponse
  } catch {
    // Non-JSON error page; fall through with an empty body.
  }

  if (!res.ok) {
    console.error('Mobile Message SMS error:', res.status, data)
    return { sent: false, error: data.error ?? data.message ?? `Mobile Message rejected the request (${res.status})` }
  }

  const result = data.results?.[0]
  if (!result) {
    console.error('Mobile Message SMS: no per-message result', data)
    return { sent: false, error: 'Mobile Message returned no result' }
  }
  if (result.status === 'blocked') {
    return { sent: false, skipped: 'opted_out' }
  }
  if (result.status !== 'success') {
    console.error('Mobile Message SMS not sent:', result)
    return { sent: false, error: result.error ?? 'Mobile Message did not send the message' }
  }
  return { sent: true, sid: result.message_id }
}

/** Lowercase hex HMAC-SHA256 of `${timestamp}.${rawBody}` — Mobile Message's signing string. */
export function computeMobileMessageSignature(
  secret: string,
  timestamp: string,
  rawBody: string | Buffer
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex')
}

export type MobileMessageSignatureVerdict =
  | { ok: true }
  | { ok: false; reason: 'missing_secret' | 'missing_headers' | 'stale_timestamp' | 'bad_signature' }

/**
 * Verify X-MM-Signature over the RAW body bytes (never re-serialised JSON), timing-safe,
 * with a freshness window so a captured request cannot be replayed later. An unset secret
 * rejects everything: signing is optional on Mobile Message's side, so "no secret" must not
 * quietly mean "accept anything".
 */
export function verifyMobileMessageSignature(input: {
  secret: string | undefined
  timestamp: string | undefined
  signature: string | undefined
  rawBody: string | Buffer
  nowMs?: number
  toleranceSec?: number
}): MobileMessageSignatureVerdict {
  const secret = input.secret?.trim()
  if (!secret) return { ok: false, reason: 'missing_secret' }

  const timestamp = input.timestamp?.trim()
  const signature = input.signature?.trim().toLowerCase()
  if (!timestamp || !signature) return { ok: false, reason: 'missing_headers' }

  const tsSec = Number(timestamp)
  if (!/^\d+$/.test(timestamp) || !Number.isFinite(tsSec)) {
    return { ok: false, reason: 'stale_timestamp' }
  }
  const nowSec = (input.nowMs ?? Date.now()) / 1000
  if (Math.abs(nowSec - tsSec) > (input.toleranceSec ?? MOBILE_MESSAGE_SIGNATURE_TOLERANCE_SEC)) {
    return { ok: false, reason: 'stale_timestamp' }
  }

  const expected = Buffer.from(computeMobileMessageSignature(secret, timestamp, input.rawBody))
  const provided = Buffer.from(signature)
  if (expected.length !== provided.length) return { ok: false, reason: 'bad_signature' }
  try {
    return timingSafeEqual(expected, provided) ? { ok: true } : { ok: false, reason: 'bad_signature' }
  } catch {
    return { ok: false, reason: 'bad_signature' }
  }
}

export interface MobileMessageInboundEvent {
  kind: 'inbound' | 'unsubscribe'
  to: string
  sender: string
  message: string
  receivedAt: string
  originalMessageId: string | null
  raw: Record<string, unknown>
}

export interface MobileMessageStatusEvent {
  kind: 'status'
  to: string
  sender: string
  status: string
  messageId: string | null
  partNumber: number | null
  totalParts: number | null
  receivedAt: string
  raw: Record<string, unknown>
}

export type MobileMessageWebhookEvent =
  | MobileMessageInboundEvent
  | MobileMessageStatusEvent
  | { kind: 'invalid'; reason: string }

function str(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * Classify a Mobile Message webhook body. Inbound and status webhooks may share one URL,
 * so `kindHint` (from `?kind=status`) is only a hint — a body carrying `type` is inbound or
 * unsubscribe, one carrying `message_id` + a delivery `status` is a delivery receipt.
 */
export function parseMobileMessageWebhook(
  rawBody: string,
  kindHint?: string
): MobileMessageWebhookEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return { kind: 'invalid', reason: 'body is not JSON' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'invalid', reason: 'body is not a JSON object' }
  }
  const raw = parsed as Record<string, unknown>
  const type = str(raw.type).toLowerCase()

  const looksLikeStatus =
    type === '' && (kindHint === 'status' || (str(raw.message_id) !== '' && str(raw.status) !== ''))

  if (looksLikeStatus) {
    return {
      kind: 'status',
      to: str(raw.to),
      sender: str(raw.sender),
      status: str(raw.status),
      messageId: str(raw.message_id) || null,
      partNumber: num(raw.part_number),
      totalParts: num(raw.total_parts),
      receivedAt: str(raw.received_at),
      raw,
    }
  }

  if (type !== 'inbound' && type !== 'unsubscribe') {
    return { kind: 'invalid', reason: `unknown webhook type "${type}"` }
  }

  const to = str(raw.to)
  const sender = str(raw.sender) || str(raw.from)
  if (!to || !sender) return { kind: 'invalid', reason: 'missing to/sender' }

  return {
    kind: type,
    to,
    sender,
    message: str(raw.message),
    receivedAt: str(raw.received_at),
    originalMessageId: str(raw.original_message_id) || null,
    raw,
  }
}

/**
 * Stable identity for one inbound event. Mobile Message retries on a slow/failed ack and
 * gives the inbound webhook no event id, so sender + to + received_at + body is the key.
 */
export function mobileMessageInboundDedupeKey(event: MobileMessageInboundEvent): string {
  const material = [event.kind, event.sender, event.to, event.receivedAt, event.message].join('\u001f')
  return `mm-inbound:${createHash('sha256').update(material).digest('hex')}`
}

/** Mobile Message timestamps are UTC; a bare `YYYY-MM-DD HH:MM:SS` must not parse as local time. */
export function parseUtcTimestamp(value: string): number {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)) {
    return Date.parse(`${trimmed.replace(' ', 'T')}Z`)
  }
  return Date.parse(trimmed)
}

/**
 * Claim an inbound event exactly once. Reuses the atomic `increment_rate_limit` counter
 * (INSERT … ON CONFLICT, see 20260806150000_rate_limits.sql) rather than a new table: the
 * first delivery gets count 1, every retry of the same event gets > 1.
 *
 * The window is pinned to the event's own `received_at`, not "now", so a retry that
 * lands in a later clock window still hits the same row. Rows are purged 2h after that
 * timestamp by the existing sweep, far beyond the minute-scale retries a slow ack causes.
 *
 * Fails OPEN: if the counter cannot be reached, the event is processed. A rare duplicate
 * lead is recoverable; a silently dropped enquiry is not.
 */
export async function claimMobileMessageInbound(
  supabase: SupabaseClient,
  event: MobileMessageInboundEvent,
  nowMs: number = Date.now()
): Promise<boolean> {
  const receivedMs = parseUtcTimestamp(event.receivedAt)
  const windowStart = Number.isFinite(receivedMs)
    ? new Date(receivedMs).toISOString()
    : new Date(Math.floor(nowMs / 3_600_000) * 3_600_000).toISOString()

  const { data, error } = await supabase.rpc('increment_rate_limit', {
    p_key: mobileMessageInboundDedupeKey(event),
    p_window_start: windowStart,
  })
  if (error) {
    console.error('[MM_INBOUND_DEDUPE_UNAVAILABLE] processing anyway:', error.message)
    return true
  }
  return Number(data) <= 1
}
