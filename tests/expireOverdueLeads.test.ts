import { describe, expect, it } from 'vitest'
import {
  EXPIRE_OVERDUE_LEADS_PATCH,
  buildAssignTimerExpiredEvent,
  isAssignTimerExpired,
  runExpireOverdueLeads,
} from '../shared/expireOverdueLeads'

function mockSupabase(leads: Record<string, unknown>[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  const events: Record<string, unknown>[] = []
  const selectFilters: Record<string, unknown> = {}

  const supabase = {
    from(table: string) {
      if (table === 'leads') {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              selectFilters[col] = val
              return {
                not: (notCol: string, op: string, notVal: unknown) => {
                  selectFilters[`${notCol}.${op}`] = notVal
                  return {
                    lt: async (ltCol: string, ltVal: unknown) => {
                      selectFilters[ltCol] = ltVal
                      return { data: leads, error: null }
                    },
                  }
                },
              }
            },
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (col: string, id: string) => {
              if (col === 'id') updates.push({ id, patch })
              return { error: null }
            },
          }),
        }
      }
      if (table === 'lead_events') {
        return {
          insert: async (row: Record<string, unknown>) => {
            events.push(row)
            return { error: null }
          },
        }
      }
      return {}
    },
  }

  return { supabase, updates, events, selectFilters }
}

describe('isAssignTimerExpired', () => {
  const nowMs = Date.parse('2026-07-03T12:00:00Z')

  it('returns true for assigned lead with past timer', () => {
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
    ).toBe(true)
  })

  it('returns false for future timer', () => {
    expect(
      isAssignTimerExpired(
        {
          id: '1',
          org_id: 'org',
          name: 'Jane',
          status: 'assigned',
          assigned_to: 'tech-1',
          timer_expires_at: '2026-07-03T13:00:00Z',
        },
        nowMs
      )
    ).toBe(false)
  })

  it('returns false without timer or wrong status', () => {
    expect(
      isAssignTimerExpired(
        {
          id: '1',
          org_id: 'org',
          name: 'Jane',
          status: 'contact_attempted',
          assigned_to: 'tech-1',
          timer_expires_at: '2026-07-03T11:00:00Z',
        },
        nowMs
      )
    ).toBe(false)

    expect(
      isAssignTimerExpired(
        {
          id: '1',
          org_id: 'org',
          name: 'Jane',
          status: 'assigned',
          assigned_to: 'tech-1',
          timer_expires_at: null,
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
  it('selects overdue assigned leads, logs expired events, and resets lead fields', async () => {
    const nowMs = Date.parse('2026-07-03T12:00:00Z')
    const { supabase, updates, events, selectFilters } = mockSupabase([
      {
        id: 'lead-1',
        org_id: 'org-1',
        name: 'Jane Doe',
        status: 'assigned',
        assigned_to: 'tech-1',
        timer_expires_at: '2026-07-03T11:00:00Z',
      },
    ])

    const result = await runExpireOverdueLeads(supabase as never, { nowMs })

    expect(selectFilters.status).toBe('assigned')
    expect(selectFilters['timer_expires_at.is']).toBe(null)
    expect(selectFilters.timer_expires_at).toBe(new Date(nowMs).toISOString())
    expect(result.expired).toBe(1)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      event_type: 'expired',
      actor_id: 'tech-1',
      lead_id: 'lead-1',
    })
    expect(updates).toHaveLength(1)
    expect(updates[0]?.id).toBe('lead-1')
    expect(updates[0]?.patch).toEqual(EXPIRE_OVERDUE_LEADS_PATCH)
  })

  it('returns zero when no leads are overdue', async () => {
    const { supabase } = mockSupabase([])
    const result = await runExpireOverdueLeads(supabase as never, {
      nowMs: Date.parse('2026-07-03T12:00:00Z'),
    })
    expect(result).toEqual({ expired: 0, errors: [] })
  })
})
