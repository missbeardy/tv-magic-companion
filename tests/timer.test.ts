import { describe, it, expect } from 'vitest'
import { PRODUCTION_TIMER_MS, CONTACT_FOLLOW_UP_MS, getExpiresAt, isRunningLow } from '../src/lib/timer'

describe('timer', () => {
  it('PRODUCTION_TIMER_MS equals 4 hours', () => {
    expect(PRODUCTION_TIMER_MS).toBe(4 * 60 * 60 * 1000)
  })

  it('CONTACT_FOLLOW_UP_MS equals 6 hours', () => {
    expect(CONTACT_FOLLOW_UP_MS).toBe(6 * 60 * 60 * 1000)
  })

  it('getExpiresAt returns ~4 hours from now', () => {
    const before = Date.now()
    const expiresAt = getExpiresAt()
    const after = Date.now()
    const expMs = new Date(expiresAt).getTime()
    expect(expMs).toBeGreaterThanOrEqual(before + PRODUCTION_TIMER_MS)
    expect(expMs).toBeLessThanOrEqual(after + PRODUCTION_TIMER_MS)
  })

  describe('isRunningLow', () => {
    it('returns false when 2 hours or more remain', () => {
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000 + 60_000).toISOString()
      expect(isRunningLow(expiresAt)).toBe(false)
    })

    it('returns true when under 2 hours remain', () => {
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000 - 1000).toISOString()
      expect(isRunningLow(expiresAt)).toBe(true)
    })

    it('returns false when expired', () => {
      const expiresAt = new Date(Date.now() - 1000).toISOString()
      expect(isRunningLow(expiresAt)).toBe(false)
    })
  })
})
