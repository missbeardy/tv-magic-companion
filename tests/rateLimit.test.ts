import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: vi.fn(),
}))

import { checkRateLimit, rateLimitIdentifier, rateLimitWindowStart } from '../api/_lib/rateLimit'
import { getSupabaseAdmin } from '../api/_lib/supabaseAdmin'

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin)

describe('rateLimitWindowStart', () => {
  it('buckets timestamps within the same window to the same start', () => {
    const windowMs = 60_000
    const a = rateLimitWindowStart(Date.parse('2026-08-06T10:00:00.000Z'), windowMs)
    const b = rateLimitWindowStart(Date.parse('2026-08-06T10:00:59.999Z'), windowMs)
    expect(a).toBe(b)
  })

  it('buckets timestamps in different windows to different starts', () => {
    const windowMs = 60_000
    const a = rateLimitWindowStart(Date.parse('2026-08-06T10:00:59.999Z'), windowMs)
    const b = rateLimitWindowStart(Date.parse('2026-08-06T10:01:00.000Z'), windowMs)
    expect(a).not.toBe(b)
  })
})

describe('rateLimitIdentifier', () => {
  it('prefers the authenticated identity over IP', () => {
    expect(rateLimitIdentifier({ 'x-forwarded-for': '1.2.3.4' }, 'org-1:user-1')).toBe('org-1:user-1')
  })

  it('falls back to the first IP in an x-forwarded-for chain', () => {
    expect(rateLimitIdentifier({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, undefined)).toBe('1.2.3.4')
  })

  it('prefers x-real-ip over x-vercel-forwarded-for and x-forwarded-for', () => {
    expect(
      rateLimitIdentifier({
        'x-real-ip': '9.9.9.9',
        'x-vercel-forwarded-for': '8.8.8.8',
        'x-forwarded-for': '1.2.3.4',
      })
    ).toBe('9.9.9.9')
  })

  it('prefers x-vercel-forwarded-for over x-forwarded-for when x-real-ip is absent', () => {
    expect(
      rateLimitIdentifier({ 'x-vercel-forwarded-for': '8.8.8.8', 'x-forwarded-for': '1.2.3.4' })
    ).toBe('8.8.8.8')
  })

  it('falls back to "unknown" when nothing is available', () => {
    expect(rateLimitIdentifier({}, undefined)).toBe('unknown')
  })
})

describe('checkRateLimit — failClosed (AUD-16)', () => {
  beforeEach(() => {
    mockGetSupabaseAdmin.mockReset()
  })

  it('fails open by default when the client is unavailable', async () => {
    mockGetSupabaseAdmin.mockReturnValue(null)
    const allowed = await checkRateLimit({ scope: 's', identifier: 'i', limit: 1, windowMs: 1000 })
    expect(allowed).toBe(true)
  })

  it('fails closed when failClosed is set and the client is unavailable', async () => {
    mockGetSupabaseAdmin.mockReturnValue(null)
    const allowed = await checkRateLimit({
      scope: 's',
      identifier: 'i',
      limit: 1,
      windowMs: 1000,
      failClosed: true,
    })
    expect(allowed).toBe(false)
  })

  it('fails closed when failClosed is set and the RPC errors', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
    } as never)
    const allowed = await checkRateLimit({
      scope: 's',
      identifier: 'i',
      limit: 1,
      windowMs: 1000,
      failClosed: true,
    })
    expect(allowed).toBe(false)
  })
})
