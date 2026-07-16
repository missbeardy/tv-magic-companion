import { describe, expect, it } from 'vitest'
import { formatAbn, gstComponentOf, isValidAbnFormat } from '../shared/gst'

describe('gstComponentOf', () => {
  it('computes the GST component of a gross amount via divide-by-11', () => {
    expect(gstComponentOf(180)).toBe(16.36)
  })

  it('handles cent-boundary amounts without float drift', () => {
    expect(gstComponentOf(99.99)).toBe(9.09)
    expect(gstComponentOf(110)).toBe(10)
    expect(gstComponentOf(1)).toBe(0.09)
  })

  it('returns 0 for zero, negative, or non-finite amounts', () => {
    expect(gstComponentOf(0)).toBe(0)
    expect(gstComponentOf(-50)).toBe(0)
    expect(gstComponentOf(NaN)).toBe(0)
  })
})

describe('isValidAbnFormat', () => {
  it('accepts 11 digits with or without spaces', () => {
    expect(isValidAbnFormat('12345678901')).toBe(true)
    expect(isValidAbnFormat('12 345 678 901')).toBe(true)
  })

  it('rejects anything that is not exactly 11 digits', () => {
    expect(isValidAbnFormat('1234567890')).toBe(false)
    expect(isValidAbnFormat('123456789012')).toBe(false)
    expect(isValidAbnFormat('12 345 678 90a')).toBe(false)
    expect(isValidAbnFormat('')).toBe(false)
  })
})

describe('formatAbn', () => {
  it('groups 11 digits as NN NNN NNN NNN', () => {
    expect(formatAbn('12345678901')).toBe('12 345 678 901')
  })

  it('reformats already-spaced input consistently', () => {
    expect(formatAbn('12 345 678 901')).toBe('12 345 678 901')
  })

  it('returns the trimmed input unchanged when not 11 digits', () => {
    expect(formatAbn(' 123 ')).toBe('123')
  })
})
