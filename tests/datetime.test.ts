import { describe, expect, it } from 'vitest'
import { formatOrgDate } from '../shared/datetime'

describe('formatOrgDate (AUD-23)', () => {
  // 2026-09-22 is a Tuesday
  const d = new Date('2026-09-22T03:00:00.000Z')

  it('full: weekday + day + month + year', () => {
    expect(formatOrgDate(d, null, 'full')).toBe('Tuesday 22 September 2026')
  })

  it('long: day + month + year, no weekday', () => {
    expect(formatOrgDate(d, null, 'long')).toBe('22 September 2026')
  })

  it('month: month only', () => {
    expect(formatOrgDate(d, null, 'month')).toBe('September')
  })

  it('monthYear: month + year', () => {
    expect(formatOrgDate(d, null, 'monthYear')).toBe('September 2026')
  })

  it('dayMonth: day + short month', () => {
    expect(formatOrgDate(d, null, 'dayMonth')).toBe('22 Sept')
  })

  it('short: weekday + day + short month', () => {
    expect(formatOrgDate(d, null, 'short')).toBe('Tue, 22 Sept')
  })

  it('weekdayMonth: weekday + month, no day', () => {
    expect(formatOrgDate(d, null, 'weekdayMonth')).toBe('September Tuesday')
  })

  it('a tz that shifts the calendar day changes the formatted date', () => {
    // 03:00 UTC on the 22nd is still the 21st in US Pacific.
    const utc = formatOrgDate(d, null, 'long')
    const pacific = formatOrgDate(d, 'America/Los_Angeles', 'long')
    expect(pacific).not.toBe(utc)
    expect(pacific).toBe('21 September 2026')
  })

  it('omitting tz behaves the same as passing undefined or null', () => {
    expect(formatOrgDate(d, undefined, 'long')).toBe(formatOrgDate(d, null, 'long'))
  })
})
