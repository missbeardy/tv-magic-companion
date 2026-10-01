import { describe, expect, it } from 'vitest'
import { resolveLeadNextAction } from '../src/lib/leadNextAction'

describe('resolveLeadNextAction', () => {
  it('returns assign for manager on unassigned', () => {
    expect(
      resolveLeadNextAction({
        status: 'unassigned',
        isManager: true,
        isEmployee: false,
      })?.kind
    ).toBe('assign')
  })

  it('returns self_assign for employee on unassigned', () => {
    expect(
      resolveLeadNextAction({
        status: 'unassigned',
        isManager: false,
        isEmployee: true,
      })?.kind
    ).toBe('self_assign')
  })

  it('returns nothing on unassigned when the assign pool is hidden', () => {
    expect(
      resolveLeadNextAction({
        status: 'unassigned',
        hideAssignPool: true,
        isManager: true,
        isEmployee: false,
      })
    ).toBeNull()
  })

  it('returns call for manager and employee when assigned', () => {
    for (const isManager of [true, false]) {
      expect(
        resolveLeadNextAction({
          status: 'assigned',
          isManager,
          isEmployee: !isManager,
        })?.kind
      ).toBe('call')
    }
  })

  it('returns complete for booked', () => {
    expect(
      resolveLeadNextAction({
        status: 'booked',
        isManager: true,
        isEmployee: false,
      })?.kind
    ).toBe('complete')
  })

  it('returns null for completed/lost', () => {
    expect(
      resolveLeadNextAction({
        status: 'completed',
        isManager: true,
        isEmployee: false,
      })
    ).toBeNull()
    expect(
      resolveLeadNextAction({
        status: 'lost',
        isManager: true,
        isEmployee: false,
      })
    ).toBeNull()
  })
})
