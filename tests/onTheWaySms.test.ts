import { describe, expect, it } from 'vitest'
import { buildOnTheWayMessage, getOnTheWayBlockReason } from '../src/lib/onTheWaySms'

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

describe('buildOnTheWayMessage', () => {
  const lead = {
    id: '1',
    name: 'Jane',
    phone: '0412345678',
    address: '10 George St, Sydney',
    service_type: 'TV Aerial',
  }

  it('includes org name, tech name, and maps link', () => {
    const message = buildOnTheWayMessage(
      lead,
      'Alex Tech',
      { name: 'TVMagic Sydney' } as never,
      null
    )
    expect(message).toContain('Alex Tech')
    expect(message).toContain('TVMagic Sydney')
    expect(message).toContain('TV Aerial')
    expect(message).toContain('google.com/maps')
  })

  it('omits maps link when lead has no address', () => {
    const message = buildOnTheWayMessage(
      { ...lead, address: null },
      'Alex Tech',
      { name: 'TVMagic' } as never,
      null
    )
    expect(message).not.toContain('google.com/maps')
  })
})
