import { describe, expect, it } from 'vitest'
import { rateLimitIdentifier, rateLimitWindowStart } from '../api/_lib/rateLimit'

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
    expect(rateLimitIdentifier('1.2.3.4', 'org-1:user-1')).toBe('org-1:user-1')
  })

  it('falls back to the first IP in an x-forwarded-for chain', () => {
    expect(rateLimitIdentifier('1.2.3.4, 5.6.7.8', undefined)).toBe('1.2.3.4')
  })

  it('falls back to "unknown" when nothing is available', () => {
    expect(rateLimitIdentifier(undefined, undefined)).toBe('unknown')
  })
})
