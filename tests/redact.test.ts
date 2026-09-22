import { describe, expect, it } from 'vitest'
import { maskPhone } from '../api/_lib/redact'

describe('maskPhone (AUD-19)', () => {
  it('keeps only the last 3 digits', () => {
    expect(maskPhone('+61412345678')).toBe('***678')
  })

  it('strips non-digit formatting before masking', () => {
    expect(maskPhone('0412 345 678')).toBe('***678')
  })

  it('returns *** for a very short number', () => {
    expect(maskPhone('12')).toBe('***')
  })

  it('returns an empty string for null/undefined', () => {
    expect(maskPhone(null)).toBe('')
    expect(maskPhone(undefined)).toBe('')
  })
})
