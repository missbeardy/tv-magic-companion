import { describe, expect, it } from 'vitest'
import { nonEmptyLineItems, sumLineItems } from '../src/lib/lineItems'

describe('sumLineItems', () => {
  it('sums amounts', () => {
    expect(sumLineItems([{ label: 'A', amount: 100 }, { label: 'B', amount: 49.99 }])).toBe(149.99)
  })

  it('returns 0 for an empty list', () => {
    expect(sumLineItems([])).toBe(0)
  })

  it('treats non-finite amounts as 0', () => {
    expect(sumLineItems([{ label: 'A', amount: NaN }, { label: 'B', amount: 50 }])).toBe(50)
  })

  it('avoids float drift on repeated cent amounts', () => {
    expect(sumLineItems([{ label: 'A', amount: 0.1 }, { label: 'B', amount: 0.2 }])).toBe(0.3)
  })
})

describe('nonEmptyLineItems', () => {
  it('drops items with a blank or whitespace-only label', () => {
    expect(
      nonEmptyLineItems([
        { label: 'Aerial install', amount: 180 },
        { label: '   ', amount: 50 },
        { label: '', amount: 0 },
      ])
    ).toEqual([{ label: 'Aerial install', amount: 180 }])
  })
})
