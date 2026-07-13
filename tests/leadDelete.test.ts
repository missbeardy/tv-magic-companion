import { describe, expect, it } from 'vitest'
import { LEAD_EVENT_TYPES } from '../src/lib/leadEventPayload'

describe('lead soft-delete event type', () => {
  it('includes deleted in lead event types', () => {
    expect(LEAD_EVENT_TYPES).toContain('deleted')
  })
})

describe('delete reason validation', () => {
  const MIN_REASON_LENGTH = 3

  function isValidReason(reason: unknown): boolean {
    return typeof reason === 'string' && reason.trim().length >= MIN_REASON_LENGTH
  }

  it('rejects empty or short reasons', () => {
    expect(isValidReason('')).toBe(false)
    expect(isValidReason('  ')).toBe(false)
    expect(isValidReason('ab')).toBe(false)
  })

  it('accepts trimmed reasons at minimum length', () => {
    expect(isValidReason('spam')).toBe(true)
    expect(isValidReason('  duplicate lead  ')).toBe(true)
  })
})
