import { describe, expect, it } from 'vitest'
import { aiUsageMonthKey } from '../api/_lib/aiUsage'

describe('aiUsageMonthKey', () => {
  it('formats as YYYY-MM in UTC', () => {
    expect(aiUsageMonthKey(new Date('2026-08-06T23:30:00.000Z'))).toBe('2026-08')
  })

  it('pads single-digit months', () => {
    expect(aiUsageMonthKey(new Date('2026-01-15T00:00:00.000Z'))).toBe('2026-01')
  })

  it('rolls over at the UTC month boundary', () => {
    expect(aiUsageMonthKey(new Date('2026-01-31T23:59:59.999Z'))).toBe('2026-01')
    expect(aiUsageMonthKey(new Date('2026-02-01T00:00:00.000Z'))).toBe('2026-02')
  })
})
