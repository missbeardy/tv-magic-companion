import { describe, expect, it } from 'vitest'
import { isLeadVisibleInActiveKanban } from '../src/lib/leadsKanban'

describe('isLeadVisibleInActiveKanban', () => {
  it('keeps leads visible when not hidden', () => {
    expect(isLeadVisibleInActiveKanban('lost', null)).toBe(true)
    expect(isLeadVisibleInActiveKanban('completed', undefined)).toBe(true)
  })

  it('hides only lost and completed when hidden_from_kanban_at is set', () => {
    const hiddenAt = '2026-07-01T00:05:00.000Z'
    expect(isLeadVisibleInActiveKanban('lost', hiddenAt)).toBe(false)
    expect(isLeadVisibleInActiveKanban('completed', hiddenAt)).toBe(false)
  })

  it('keeps other statuses visible even if hidden marker exists', () => {
    const hiddenAt = '2026-07-01T00:05:00.000Z'
    expect(isLeadVisibleInActiveKanban('booked', hiddenAt)).toBe(true)
    expect(isLeadVisibleInActiveKanban('contact_attempted', hiddenAt)).toBe(true)
    expect(isLeadVisibleInActiveKanban('unassigned', hiddenAt)).toBe(true)
  })
})
