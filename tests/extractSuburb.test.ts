import { describe, expect, it } from 'vitest'
import { extractSuburbFromAddress, formatLocalityLabelFromAddress } from '../src/lib/extractSuburb'

describe('extractSuburbFromAddress', () => {
  it('extracts suburb from comma-separated address with state and postcode', () => {
    expect(extractSuburbFromAddress('12 Main St, Beaudesert QLD 4285')).toBe('Beaudesert')
  })

  it('extracts suburb when state is a separate segment', () => {
    expect(extractSuburbFromAddress('12 Main St, Beaudesert, QLD 4285')).toBe('Beaudesert')
  })

  it('extracts suburb from single-line address', () => {
    expect(extractSuburbFromAddress('12 Main St Beaudesert QLD 4285')).toBe('Beaudesert')
  })

  it('returns null for empty or missing address', () => {
    expect(extractSuburbFromAddress('')).toBeNull()
    expect(extractSuburbFromAddress(null)).toBeNull()
    expect(extractSuburbFromAddress(undefined)).toBeNull()
  })
})

describe('formatLocalityLabelFromAddress', () => {
  it('formats suburb and state', () => {
    expect(formatLocalityLabelFromAddress('12 Main St, Tarragindi QLD 4121')).toBe('Tarragindi, QLD')
  })

  it('returns suburb only when state is missing', () => {
    expect(formatLocalityLabelFromAddress('12 Main St, Beaudesert')).toBe('Beaudesert')
  })
})
