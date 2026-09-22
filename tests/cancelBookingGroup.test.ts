import { describe, it, expect, vi, beforeEach } from 'vitest'

const deleteSelect = vi.fn()
const groupSelectEq = vi.fn()
const leadUpdateEq = vi.fn()

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'events') {
        return {
          select: () => ({ eq: groupSelectEq }),
          delete: () => ({ eq: () => ({ select: deleteSelect }) }),
        }
      }
      if (table === 'leads') return { update: () => ({ eq: leadUpdateEq }) }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    },
  },
}))
vi.mock('../src/lib/leadEvents', () => ({ logLeadEvent: vi.fn().mockResolvedValue(undefined) }))

const { cancelBooking, isGroupCancelBlocked, SHARED_BOOKING_CANCEL_ERROR } = await import('../src/lib/cancelBooking')

const base = { eventId: 'ev-1', orgId: 'org-1', actorId: 'tech-a', actorRole: 'employee' }

describe('isGroupCancelBlocked', () => {
  it('lets a manager cancel a group that includes other technicians', () => {
    expect(isGroupCancelBlocked(['tech-a', 'tech-b'], 'mgr', 'manager')).toBe(false)
  })

  it('lets an employee cancel a group made up only of their own events', () => {
    expect(isGroupCancelBlocked(['tech-a', 'tech-a'], 'tech-a', 'employee')).toBe(false)
  })

  it('blocks an employee from cancelling a group that includes someone else', () => {
    expect(isGroupCancelBlocked(['tech-a', 'tech-b'], 'tech-a', 'employee')).toBe(true)
  })
})

describe('cancelBooking', () => {
  beforeEach(() => {
    deleteSelect.mockReset()
    groupSelectEq.mockReset()
    leadUpdateEq.mockReset().mockResolvedValue({ error: null })
  })

  it('refuses a shared booking before deleting anything', async () => {
    groupSelectEq.mockResolvedValue({ data: [{ user_id: 'tech-a' }, { user_id: 'tech-b' }], error: null })

    const result = await cancelBooking({ ...base, bookingGroupId: 'grp-1', leadId: 'lead-1' })

    expect(result.error).toBe(SHARED_BOOKING_CANCEL_ERROR)
    expect(deleteSelect).not.toHaveBeenCalled()
    expect(leadUpdateEq).not.toHaveBeenCalled()
  })

  it('does not mark the lead cancelled when RLS deleted nothing', async () => {
    deleteSelect.mockResolvedValue({ data: [], error: null })

    const result = await cancelBooking({ ...base, leadId: 'lead-1' })

    expect(result.error).toMatch(/permission/)
    expect(leadUpdateEq).not.toHaveBeenCalled()
  })

  it('cancels the lead once the event is actually deleted', async () => {
    deleteSelect.mockResolvedValue({ data: [{ id: 'ev-1' }], error: null })

    const result = await cancelBooking({ ...base, leadId: 'lead-1' })

    expect(result).toEqual({})
    expect(leadUpdateEq).toHaveBeenCalledWith('id', 'lead-1')
  })
})
