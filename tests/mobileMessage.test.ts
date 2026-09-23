import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimMobileMessageInbound,
  computeMobileMessageSignature,
  mobileMessageInboundDedupeKey,
  parseMobileMessageWebhook,
  parseUtcTimestamp,
  postMobileMessageSms,
  toMobileMessageNumber,
  verifyMobileMessageSignature,
  type MobileMessageInboundEvent,
} from '../api/_lib/mobileMessage'

// fetch is stubbed in every send test — no test may hit the real Mobile Message API.

function okResponse(json: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => json } as Response
}

describe('postMobileMessageSms — request shape', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, MOBILE_MESSAGE_API_USERNAME: 'mm-user', MOBILE_MESSAGE_API_PASSWORD: 'mm-pass' }
    vi.stubGlobal('fetch', vi.fn())
  })

  it('always sends enable_unicode, Basic auth, JSON and an Idempotency-Key', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({ status: 'complete', results: [{ status: 'success', message_id: 'uuid-1' }] })
    )

    const result = await postMobileMessageSms({
      from: '+61400111222',
      to: '+61412345678',
      body: '“Smart quotes” and 🙂',
      idempotencyKey: 'key-123',
    })

    expect(result).toEqual({ sent: true, sid: 'uuid-1' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.mobilemessage.com.au/v1/messages')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('mm-user:mm-pass').toString('base64')}`)
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Idempotency-Key']).toBe('key-123')

    const payload = JSON.parse(init.body as string)
    expect(payload).toEqual({
      enable_unicode: true,
      messages: [{ to: '61412345678', message: '“Smart quotes” and 🙂', sender: '61400111222' }],
    })
  })

  it('generates an Idempotency-Key when the caller gives none', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({ results: [{ status: 'success', message_id: 'uuid-2' }] })
    )
    await postMobileMessageSms({ from: '0400111222', to: '0412345678', body: 'Hi' })
    const headers = (vi.mocked(fetch).mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reuses the same Idempotency-Key on the single retry after a 5xx', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(okResponse({ error: 'upstream' }, 502))
      .mockResolvedValueOnce(okResponse({ results: [{ status: 'success', message_id: 'uuid-3' }] }))

    const result = await postMobileMessageSms({
      from: '+61400111222',
      to: '+61412345678',
      body: 'Hi',
      retryDelayMs: 0,
    })
    expect(result).toEqual({ sent: true, sid: 'uuid-3' })
    expect(fetch).toHaveBeenCalledTimes(2)
    const keys = vi.mocked(fetch).mock.calls.map(
      (call) => ((call as [string, RequestInit])[1].headers as Record<string, string>)['Idempotency-Key']
    )
    expect(keys[0]).toBe(keys[1])
  })

  it('retries once after a network error, then gives up', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'))
    const result = await postMobileMessageSms({
      from: '+61400111222',
      to: '+61412345678',
      body: 'Hi',
      retryDelayMs: 0,
    })
    expect(result).toEqual({ sent: false, error: 'Failed to send SMS' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('postMobileMessageSms — result handling', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, MOBILE_MESSAGE_API_USERNAME: 'mm-user', MOBILE_MESSAGE_API_PASSWORD: 'mm-pass' }
    vi.stubGlobal('fetch', vi.fn())
  })

  it('treats a per-message "error" as not sent even on HTTP 200', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({
        status: 'complete',
        results: [{ status: 'error', error: 'Invalid sender. You do not have permission to use this sender.' }],
      })
    )
    const result = await postMobileMessageSms({ from: '+61400111222', to: '+61412345678', body: 'Hi' })
    expect(result.sent).toBe(false)
    expect(result.error).toContain('Invalid sender')
  })

  it('treats a per-message "blocked" (unsubscribed) as opted out, not sent', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({ status: 'complete', results: [{ status: 'blocked', message_id: 'uuid-b' }] })
    )
    const result = await postMobileMessageSms({ from: '+61400111222', to: '+61412345678', body: 'Hi' })
    expect(result).toEqual({ sent: false, skipped: 'opted_out' })
  })

  it('reports an HTTP error (e.g. out of credits) as not sent without retrying', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({ error: 'Insufficient credits to send the batch of messages.' }, 403)
    )
    const result = await postMobileMessageSms({ from: '+61400111222', to: '+61412345678', body: 'Hi' })
    expect(result).toEqual({ sent: false, error: 'Insufficient credits to send the batch of messages.' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reports a 200 with no results as not sent', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ status: 'complete', results: [] }))
    const result = await postMobileMessageSms({ from: '+61400111222', to: '+61412345678', body: 'Hi' })
    expect(result.sent).toBe(false)
  })

  it('skips without calling the API when credentials are missing', async () => {
    delete process.env.MOBILE_MESSAGE_API_PASSWORD
    const result = await postMobileMessageSms({ from: '+61400111222', to: '+61412345678', body: 'Hi' })
    expect(result).toEqual({ sent: false, skipped: 'Mobile Message not configured' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('toMobileMessageNumber', () => {
  it('formats AU numbers as international digits with no +', () => {
    expect(toMobileMessageNumber('+61412345678')).toBe('61412345678')
    expect(toMobileMessageNumber('0412 345 678')).toBe('61412345678')
    expect(toMobileMessageNumber('61412345678')).toBe('61412345678')
  })
})

describe('Mobile Message webhook signature', () => {
  // Documented test vector (Mobile Message API docs, "Verifying webhook signatures").
  const SECRET = 'abc123'
  const TIMESTAMP = '1754640000'
  const BODY = '{"test":1}'
  const EXPECTED = '52344b9592722e0241d82036e0920f4286bc0d47ba4624c5a1588193490a1efb'
  const NOW_MS = 1754640000 * 1000

  it('matches the documented test vector', () => {
    expect(computeMobileMessageSignature(SECRET, TIMESTAMP, BODY)).toBe(EXPECTED)
    expect(computeMobileMessageSignature(SECRET, TIMESTAMP, Buffer.from(BODY))).toBe(EXPECTED)
  })

  it('accepts the test vector inside the freshness window', () => {
    expect(
      verifyMobileMessageSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature: EXPECTED,
        rawBody: BODY,
        nowMs: NOW_MS + 60_000,
      })
    ).toEqual({ ok: true })
  })

  it('accepts an uppercase hex signature', () => {
    expect(
      verifyMobileMessageSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature: EXPECTED.toUpperCase(),
        rawBody: BODY,
        nowMs: NOW_MS,
      }).ok
    ).toBe(true)
  })

  it('rejects a bad signature', () => {
    const bad = EXPECTED.slice(0, -1) + (EXPECTED.endsWith('b') ? 'c' : 'b')
    expect(
      verifyMobileMessageSignature({ secret: SECRET, timestamp: TIMESTAMP, signature: bad, rawBody: BODY, nowMs: NOW_MS })
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects a body that was re-serialised (whitespace changes the bytes)', () => {
    expect(
      verifyMobileMessageSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature: EXPECTED,
        rawBody: '{ "test": 1 }',
        nowMs: NOW_MS,
      })
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects a signature of the wrong length without throwing', () => {
    expect(
      verifyMobileMessageSignature({ secret: SECRET, timestamp: TIMESTAMP, signature: 'abc', rawBody: BODY, nowMs: NOW_MS })
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects a stale timestamp even when the signature is valid', () => {
    expect(
      verifyMobileMessageSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature: EXPECTED,
        rawBody: BODY,
        nowMs: NOW_MS + 301_000,
      })
    ).toEqual({ ok: false, reason: 'stale_timestamp' })
    expect(
      verifyMobileMessageSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature: EXPECTED,
        rawBody: BODY,
        nowMs: NOW_MS - 301_000,
      })
    ).toEqual({ ok: false, reason: 'stale_timestamp' })
  })

  it('rejects a non-numeric timestamp', () => {
    expect(
      verifyMobileMessageSignature({ secret: SECRET, timestamp: 'soon', signature: EXPECTED, rawBody: BODY, nowMs: NOW_MS })
        .ok
    ).toBe(false)
  })

  it('rejects everything when the secret is missing', () => {
    for (const secret of [undefined, '', '   ']) {
      expect(
        verifyMobileMessageSignature({ secret, timestamp: TIMESTAMP, signature: EXPECTED, rawBody: BODY, nowMs: NOW_MS })
      ).toEqual({ ok: false, reason: 'missing_secret' })
    }
  })

  it('rejects missing signature headers', () => {
    expect(
      verifyMobileMessageSignature({ secret: SECRET, timestamp: undefined, signature: EXPECTED, rawBody: BODY })
    ).toEqual({ ok: false, reason: 'missing_headers' })
    expect(
      verifyMobileMessageSignature({ secret: SECRET, timestamp: TIMESTAMP, signature: undefined, rawBody: BODY })
    ).toEqual({ ok: false, reason: 'missing_headers' })
  })
})

describe('parseMobileMessageWebhook', () => {
  it('maps an inbound payload', () => {
    const event = parseMobileMessageWebhook(
      JSON.stringify({
        to: '61400111222',
        message: 'Need a TV mounted',
        sender: '61412345678',
        received_at: '2026-09-23 01:02:03',
        type: 'inbound',
        original_message_id: '',
        original_custom_ref: '',
      })
    )
    expect(event).toMatchObject({
      kind: 'inbound',
      to: '61400111222',
      sender: '61412345678',
      message: 'Need a TV mounted',
      receivedAt: '2026-09-23 01:02:03',
      originalMessageId: null,
    })
  })

  it('maps an unsubscribe payload', () => {
    const event = parseMobileMessageWebhook(
      JSON.stringify({ to: '61400111222', message: 'STOP', sender: '61412345678', received_at: 'x', type: 'unsubscribe' })
    )
    expect(event.kind).toBe('unsubscribe')
  })

  it('recognises a delivery receipt from its payload or the kind hint', () => {
    const receipt = {
      to: '61412345678',
      message: 'Hi',
      sender: '61400111222',
      received_at: '2026-09-23 01:02:03',
      status: 'delivered',
      message_id: 'uuid-1',
      part_number: 1,
      total_parts: 2,
    }
    expect(parseMobileMessageWebhook(JSON.stringify(receipt))).toMatchObject({
      kind: 'status',
      status: 'delivered',
      messageId: 'uuid-1',
      partNumber: 1,
      totalParts: 2,
    })
    const noId: Record<string, unknown> = { ...receipt }
    delete noId.message_id
    expect(parseMobileMessageWebhook(JSON.stringify(noId), 'status').kind).toBe('status')
  })

  it('flags junk as invalid', () => {
    expect(parseMobileMessageWebhook('not json').kind).toBe('invalid')
    expect(parseMobileMessageWebhook('[]').kind).toBe('invalid')
    expect(parseMobileMessageWebhook('{"type":"inbound","message":"hi"}').kind).toBe('invalid')
    expect(parseMobileMessageWebhook('{"type":"weird","to":"1","sender":"2"}').kind).toBe('invalid')
  })
})

describe('inbound dedupe', () => {
  const base: MobileMessageInboundEvent = {
    kind: 'inbound',
    to: '61400111222',
    sender: '61412345678',
    message: 'Hello',
    receivedAt: '2026-09-23 01:02:03',
    originalMessageId: null,
    raw: {},
  }

  it('keys on sender + to + received_at + body', () => {
    const key = mobileMessageInboundDedupeKey(base)
    expect(key).toMatch(/^mm-inbound:[0-9a-f]{64}$/)
    expect(mobileMessageInboundDedupeKey({ ...base, raw: { anything: 1 } })).toBe(key)
    expect(mobileMessageInboundDedupeKey({ ...base, message: 'Hello!' })).not.toBe(key)
    expect(mobileMessageInboundDedupeKey({ ...base, receivedAt: '2026-09-23 01:02:04' })).not.toBe(key)
    expect(mobileMessageInboundDedupeKey({ ...base, sender: '61412345679' })).not.toBe(key)
  })

  it('parses Mobile Message timestamps as UTC', () => {
    expect(parseUtcTimestamp('2026-09-23 01:02:03')).toBe(Date.UTC(2026, 8, 23, 1, 2, 3))
    expect(parseUtcTimestamp('2026-09-23T01:02:03Z')).toBe(Date.UTC(2026, 8, 23, 1, 2, 3))
  })

  it('claims the first delivery and rejects a retry of the same event', async () => {
    let count = 0
    const rpc = vi.fn(async () => ({ data: ++count, error: null }))
    const supabase = { rpc } as never

    await expect(claimMobileMessageInbound(supabase, base)).resolves.toBe(true)
    await expect(claimMobileMessageInbound(supabase, base)).resolves.toBe(false)
    expect(rpc).toHaveBeenCalledWith('increment_rate_limit', {
      p_key: mobileMessageInboundDedupeKey(base),
      p_window_start: '2026-09-23T01:02:03.000Z',
    })
  })

  it('fails open (processes) when the counter is unavailable', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { message: 'db down' } })) } as never
    await expect(claimMobileMessageInbound(supabase, base)).resolves.toBe(true)
  })
})
