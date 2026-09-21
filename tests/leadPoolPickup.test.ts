import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  blocksUnassignedStatusChange,
  buildPoolPickupUpdate,
  isPoolLead,
  shouldPoolPickup,
} from '../src/lib/leadPoolPickup'
import { LEAD_TRANSITION_CONFLICT, transitionLead } from '../src/lib/leadTransition'

const updateResult = vi.hoisted(() => ({
  count: 0 as number | null,
  error: null as { message: string } | null,
  data: [] as { id: string }[],
}))

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: async () => updateResult,
          }),
        }),
      }),
    }),
  },
}))

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

describe('blocksUnassignedStatusChange', () => {
  it('never blocks a move back to unassigned', () => {
    expect(blocksUnassignedStatusChange('unassigned', null)).toBe(false)
    expect(blocksUnassignedStatusChange('unassigned', undefined)).toBe(false)
  })

  it('blocks a non-unassigned status with nobody assigned', () => {
    expect(blocksUnassignedStatusChange('lost', null)).toBe(true)
    expect(blocksUnassignedStatusChange('completed', undefined)).toBe(true)
  })

  it('allows a non-unassigned status once somebody is assigned', () => {
    expect(blocksUnassignedStatusChange('lost', 'user-1')).toBe(false)
    expect(blocksUnassignedStatusChange('contact_attempted', 'user-1')).toBe(false)
  })
})

describe('transitionLead conflict guard', () => {
  beforeEach(() => {
    updateResult.count = 0
    updateResult.error = null
    updateResult.data = []
  })

  it('returns CONFLICT when zero rows change', async () => {
    const result = await transitionLead('lead-1', 'unassigned', { status: 'assigned', assigned_to: 'user-1' })
    expect(result).toEqual({ ok: false, error: LEAD_TRANSITION_CONFLICT })
  })

  it('returns ok when a row is updated', async () => {
    updateResult.count = 1
    updateResult.data = [{ id: 'lead-1' }]
    const result = await transitionLead('lead-1', 'unassigned', { status: 'assigned', assigned_to: 'user-1' })
    expect(result).toEqual({ ok: true })
  })
})
