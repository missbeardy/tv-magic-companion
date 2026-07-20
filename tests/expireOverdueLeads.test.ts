import { describe, expect, it } from 'vitest'
import {
  buildAssignTimerExpiredEvent,
  isAssignTimerExpired,
  runExpireOverdueLeads,
} from '../shared/expireOverdueLeads'

describe('isAssignTimerExpired', () => {
  const nowMs = Date.parse('2026-07-03T12:00:00Z')

  it('always returns false (assign-timer auto-unassign disabled)', () => {
    expect(
      isAssignTimerExpired(
        {
          id: '1',
          org_id: 'org',
          name: 'Jane',
          status: 'assigned',
          assigned_to: 'tech-1',
          timer_expires_at: '2026-07-03T11:00:00Z',
        },
        nowMs
      )
    ).toBe(false)
  })
})

describe('buildAssignTimerExpiredEvent', () => {
  it('attributes expiry to previous assignee with lead and assignee names', () => {
    const event = buildAssignTimerExpiredEvent(
      {
        id: 'lead-1',
        org_id: 'org-1',
        name: 'John Smith',
        assigned_to: 'tech-1',
      },
      'Alex Jones'
    )

    expect(event.event_type).toBe('expired')
    expect(event.actor_id).toBe('tech-1')
    expect(event.note).toBe('John Smith — assign timer expired (assigned to Alex Jones)')
    expect(event.payload).toEqual({
      from_status: 'assigned',
      to_status: 'unassigned',
      source: 'assign_timer',
      lead_name: 'John Smith',
      previous_assignee_id: 'tech-1',
      previous_assignee_name: 'Alex Jones',
    })
  })
})

describe('runExpireOverdueLeads', () => {
  it('is a no-op and never unassigns leads', async () => {
    const result = await runExpireOverdueLeads({} as never, {
      nowMs: Date.parse('2026-07-03T12:00:00Z'),
    })
    expect(result).toEqual({ expired: 0, errors: [] })
  })
})
