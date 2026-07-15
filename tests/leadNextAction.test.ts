import { describe, expect, it } from 'vitest'
import { resolveLeadNextAction } from '../src/lib/leadNextAction'

describe('resolveLeadNextAction', () => {
  it('returns assign for manager on unassigned', () => {
    expect(
      resolveLeadNextAction({
        status: 'unassigned',
        quoteEnabled: true,
        isManager: true,
        isEmployee: false,
      })?.kind
    ).toBe('assign')
  })

  it('returns self_assign for employee on unassigned', () => {
    expect(
      resolveLeadNextAction({
        status: 'unassigned',
        quoteEnabled: false,
        isManager: false,
        isEmployee: true,
      })?.kind
    ).toBe('self_assign')
  })

  it('returns quote for manager when no quote yet', () => {
    expect(
      resolveLeadNextAction({
        status: 'assigned',
        quoteEnabled: true,
        isManager: true,
        isEmployee: false,
      })?.kind
    ).toBe('quote')
  })

  it('returns call for employee when assigned', () => {
    expect(
      resolveLeadNextAction({
        status: 'assigned',
        quoteEnabled: true,
        isManager: false,
        isEmployee: true,
      })?.kind
    ).toBe('call')
  })

  it('returns book when quote accepted and not booked', () => {
    expect(
      resolveLeadNextAction({
        status: 'contact_attempted',
        latestQuoteStatus: 'accepted',
        quoteEnabled: true,
        isManager: true,
        isEmployee: false,
      })?.kind
    ).toBe('book')
  })

  it('returns complete for booked', () => {
    expect(
      resolveLeadNextAction({
        status: 'booked',
        latestQuoteStatus: 'accepted',
        quoteEnabled: true,
        isManager: true,
        isEmployee: false,
      })?.kind
    ).toBe('complete')
  })

  it('returns null for completed/lost', () => {
    expect(
      resolveLeadNextAction({
        status: 'completed',
        quoteEnabled: true,
        isManager: true,
        isEmployee: false,
      })
    ).toBeNull()
    expect(
      resolveLeadNextAction({
        status: 'lost',
        quoteEnabled: true,
        isManager: true,
        isEmployee: false,
      })
    ).toBeNull()
  })
})
