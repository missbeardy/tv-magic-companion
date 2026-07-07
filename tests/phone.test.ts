import { describe, expect, it } from 'vitest'
import { formatAuPhoneForSms, formatAuPhoneForTel } from '../src/lib/phone'

describe('formatAuPhoneForTel', () => {
  it('strips spaces and dashes from local AU numbers', () => {
    expect(formatAuPhoneForTel('0412 345 678')).toBe('0412345678')
    expect(formatAuPhoneForTel('0412-345-678')).toBe('0412345678')
  })

  it('keeps local 0-prefixed format for tel: links', () => {
    expect(formatAuPhoneForTel('0400111222')).toBe('0400111222')
  })

  it('normalizes +61 E.164 input', () => {
    expect(formatAuPhoneForTel('+61 412 345 678')).toBe('+61412345678')
    expect(formatAuPhoneForTel('61412345678')).toBe('+61412345678')
  })

  it('returns trimmed input when no digits', () => {
    expect(formatAuPhoneForTel('  ')).toBe('')
  })
})

describe('formatAuPhoneForSms', () => {
  it('converts local AU to E.164', () => {
    expect(formatAuPhoneForSms('0412 345 678')).toBe('+61412345678')
  })
})
