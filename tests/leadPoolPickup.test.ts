import { describe, expect, it } from 'vitest'
import {
  buildPoolPickupUpdate,
  isPoolLead,
  shouldPoolPickup,
} from '../src/lib/leadPoolPickup'

describe('leadPoolPickup', () => {
  it('identifies pool leads', () => {
    expect(isPoolLead('unassigned')).toBe(true)
    expect(isPoolLead('assigned')).toBe(false)
  })

  it('pickup from pool to contact_attempted assigns without timer', () => {
    const update = buildPoolPickupUpdate('unassigned', 'contact_attempted', 'user-1')
    expect(update.assigned_to).toBe('user-1')
    expect(update.assigned_at).toBeTruthy()
    expect(update.timer_expires_at).toBeUndefined()
  })

  it('pickup from pool to assigned sets timer', () => {
    const update = buildPoolPickupUpdate('unassigned', 'assigned', 'user-1')
    expect(update.assigned_to).toBe('user-1')
    expect(update.timer_expires_at).toBeTruthy()
  })

  it('no pickup when already past pool', () => {
    expect(shouldPoolPickup('assigned', 'contact_attempted', 'user-1')).toBe(false)
    expect(buildPoolPickupUpdate('assigned', 'contact_attempted', 'user-1')).toEqual({})
  })

  it('no pickup when returning to pool', () => {
    expect(shouldPoolPickup('assigned', 'unassigned', 'user-1')).toBe(false)
    expect(buildPoolPickupUpdate('assigned', 'unassigned', 'user-1')).toEqual({})
  })

  it('no pickup without actor', () => {
    expect(shouldPoolPickup('unassigned', 'assigned', null)).toBe(false)
    expect(buildPoolPickupUpdate('unassigned', 'assigned', undefined)).toEqual({})
  })
})
