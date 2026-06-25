import { describe, expect, it } from 'vitest'
import { getOnTheWayBlockReason } from '../src/lib/onTheWaySms'

describe('getOnTheWayBlockReason', () => {
  const lead = { id: '1', name: 'Jane', phone: '0412345678', address: '1 Main St' }

  it('blocks when feature switch is off', () => {
    expect(getOnTheWayBlockReason(lead, false)).toMatch(/disabled/)
  })

  it('blocks when lead has no phone', () => {
    expect(getOnTheWayBlockReason({ ...lead, phone: '' }, true)).toMatch(/no phone/)
  })

  it('allows when enabled and phone present', () => {
    expect(getOnTheWayBlockReason(lead, true)).toBeNull()
  })
})
