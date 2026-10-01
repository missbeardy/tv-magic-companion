import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../api/_lib/rateLimit.js', () => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimitIdentifier: vi.fn(() => 'ip'),
}))

import {
  captureHeaders,
  handleVoiceWebhook,
  maskPhoneLikeDigits,
} from '../api/_lib/voiceWebhook'
import { checkRateLimit } from '../api/_lib/rateLimit'

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
  }
  return res
}

function req(method: string, query: Record<string, string>) {
  return { method, query, headers: { 'x-crazyvoicemail-signature': 'abc123' } } as never
}

const supabase = {} as import('@supabase/supabase-js').SupabaseClient

describe('handleVoiceWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue(true)
  })

  it('rejects non-POST', async () => {
    const res = mockRes()
    await handleVoiceWebhook(req('GET', { provider: 'crazytel' }), res as never, supabase, '')
    expect(res.statusCode).toBe(405)
  })

  it('404s an unknown provider', async () => {
    const res = mockRes()
    await handleVoiceWebhook(req('POST', { provider: 'nope' }), res as never, supabase, '{}')
    expect(res.statusCode).toBe(404)
  })

  it('rate-limits', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(false)
    const res = mockRes()
    await handleVoiceWebhook(req('POST', { provider: 'crazytel' }), res as never, supabase, '{}')
    expect(res.statusCode).toBe(429)
  })

  it('Crazytel capture mode acknowledges without touching the database', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = mockRes()
    // A supabase double with no methods: any DB call would throw.
    await handleVoiceWebhook(
      req('POST', { provider: 'crazytel' }),
      res as never,
      supabase,
      JSON.stringify({ event: 'voicemail.received', caller: '0412345678' })
    )
    expect(res.statusCode).toBe(200)
    const logged = info.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logged).not.toContain('0412345678')
    expect(logged).toContain('voicemail.received')
    info.mockRestore()
  })
})

describe('capture redaction', () => {
  it('masks phone-like digit runs', () => {
    expect(maskPhoneLikeDigits('{"from":"+61412345678","to":"07 3123 4567","ms":41}')).toBe(
      '{"from":"…678","to":"…567","ms":41}'
    )
  })

  it('drops credentials and hides signature values', () => {
    const out = captureHeaders({
      authorization: 'Basic x',
      cookie: 'a=b',
      'x-forwarded-for': '1.2.3.4',
      'x-crazyvoicemail-signature': 'deadbeef',
      'content-type': 'application/json',
    })
    expect(out).toEqual({
      'x-crazyvoicemail-signature': '<8 chars>',
      'content-type': 'application/json',
    })
  })
})
