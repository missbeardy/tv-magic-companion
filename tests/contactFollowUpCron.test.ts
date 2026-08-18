import { describe, expect, it, vi, beforeEach } from 'vitest'
import { runContactFollowUpCron } from '../api/_lib/runContactFollowUpCron'
import { CONTACT_FOLLOW_UP_MS } from '../shared/contactFollowUp'

const insertTrustedFollowUpReminder = vi.fn()

vi.mock('../api/_lib/notifyUser.js', () => ({
  insertTrustedFollowUpReminder: (...args: unknown[]) => insertTrustedFollowUpReminder(...args),
}))

interface MockOptions {
  eventInsertError?: string
}

function mockSupabase(leads: Record<string, unknown>[], options: MockOptions = {}) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  const events: Record<string, unknown>[] = []
  const query: Record<string, unknown> = {}

  // Mirrors the PostgREST builder: every filter returns the builder, and the chain is awaited
  // at the end. Recording each call is what lets a test assert the query shape itself.
  const builder: Record<string, unknown> = {
    select: (cols: string) => {
      query.select = cols
      return builder
    },
    eq: (col: string, val: unknown) => {
      query[`eq:${col}`] = val
      return builder
    },
    is: (col: string, val: unknown) => {
      query[`is:${col}`] = val
      return builder
    },
    not: (col: string, op: string, val: unknown) => {
      query[`not:${col}`] = `${op}:${val}`
      return builder
    },
    lte: (col: string, val: unknown) => {
      query[`lte:${col}`] = val
      return builder
    },
    order: (col: string, opts: unknown) => {
      query.order = { col, opts }
      return builder
    },
    limit: async (n: number) => {
      query.limit = n
      return { data: leads, error: null }
    },
  }

  const supabase = {
    from(table: string) {
      if (table === 'leads') {
        return {
          ...builder,
          update: (patch: Record<string, unknown>) => ({
            eq: async (col: string, id: string) => {
              if (col === 'id') updates.push({ id, patch })
              return { error: null }
            },
            in: async (col: string, ids: string[]) => {
              if (col === 'id') {
                for (const id of ids) updates.push({ id, patch })
              }
              return { error: null }
            },
          }),
        }
      }
      if (table === 'lead_events') {
        return {
          insert: async (row: Record<string, unknown>) => {
            events.push(row)
            return options.eventInsertError
              ? { error: { message: options.eventInsertError } }
              : { error: null }
          },
        }
      }
      return {}
    },
  }

  return { supabase, updates, events, query }
}

const NOW_MS = Date.parse('2026-07-01T12:00:00Z')

function dueLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    org_id: 'org-1',
    name: 'Jane Doe',
    service_type: 'TV Aerial',
    status: 'contact_attempted',
    assigned_to: 'tech-1',
    contact_attempt_round: 1,
    last_contact_attempted_at: new Date(NOW_MS - CONTACT_FOLLOW_UP_MS - 60_000).toISOString(),
    ...overrides,
  }
}

describe('runContactFollowUpCron', () => {
  beforeEach(() => {
    insertTrustedFollowUpReminder.mockReset()
    insertTrustedFollowUpReminder.mockResolvedValue({ ok: true })
  })

  it('reminds assignee on stale contact_attempted leads without changing round', async () => {
    const { supabase, updates, events } = mockSupabase([dueLead()])

    const result = await runContactFollowUpCron(supabase as never, { nowMs: NOW_MS })

    expect(result.checked).toBe(1)
    expect(result.reminded).toBe(1)
    expect(result.lost).toBe(0)
    expect(result.notified).toBe(1)
    expect(result.remaining).toBe(0)
    // The only write is the reminder cooldown stamp — round, status and
    // last_contact_attempted_at must be untouched (those only move on real employee contact).
    expect(updates).toHaveLength(1)
    expect(updates[0]).toEqual({
      id: 'lead-1',
      patch: { last_follow_up_reminder_at: new Date(NOW_MS).toISOString() },
    })
    expect(events).toHaveLength(0)
    expect(insertTrustedFollowUpReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        userId: 'tech-1',
        leadId: 'lead-1',
        title: 'Lead needs 2nd Attempt',
      })
    )
    // The trusted port is follow-up-only. A caller-controlled `type` is exactly what let a
    // request-body value skip the org membership check in notifyOrgUser.
    expect(insertTrustedFollowUpReminder.mock.calls[0][0]).not.toHaveProperty('type')
  })

  it('excludes soft-deleted leads and bounds the candidate load', async () => {
    const { supabase, query } = mockSupabase([])

    await runContactFollowUpCron(supabase as never, { nowMs: NOW_MS })

    expect(query['eq:status']).toBe('contact_attempted')
    expect(query['is:deleted_at']).toBeNull()
    expect(query.limit).toBe(1000)
    // Oldest-first, so a truncated load still processes the leads nearest auto-lost.
    expect(query.order).toEqual({
      col: 'last_contact_attempted_at',
      opts: { ascending: true },
    })
  })

  it('auto-lost final-round leads without notification', async () => {
    const { supabase, updates, events } = mockSupabase([
      dueLead({ id: 'lead-2', name: 'Bob', service_type: 'General', contact_attempt_round: 4 }),
    ])

    const result = await runContactFollowUpCron(supabase as never, { nowMs: NOW_MS })

    expect(result.lost).toBe(1)
    expect(result.reminded).toBe(0)
    expect(updates[0]?.patch.status).toBe('lost')
    expect(updates[0]?.patch.lost_reason).toBe('unable_to_contact')
    expect(events[0]?.event_type).toBe('lost')
    expect(insertTrustedFollowUpReminder).not.toHaveBeenCalled()
  })

  it('does not count a loss whose audit event failed to insert', async () => {
    const { supabase, updates } = mockSupabase(
      [dueLead({ id: 'lead-3', contact_attempt_round: 4 })],
      { eventInsertError: 'lead_events exploded' }
    )

    const result = await runContactFollowUpCron(supabase as never, { nowMs: NOW_MS })

    // The status update committed but nothing recorded why, so `lost` must not claim it.
    expect(updates[0]?.patch.status).toBe('lost')
    expect(result.lost).toBe(0)
    expect(result.errors).toEqual(['lead-3 event: lead_events exploded'])
  })

  it('keeps the cooldown stamp when delivery fails', async () => {
    insertTrustedFollowUpReminder.mockResolvedValue({ ok: false, error: 'notify exploded' })
    const { supabase, updates } = mockSupabase([dueLead()])

    const result = await runContactFollowUpCron(supabase as never, { nowMs: NOW_MS })

    // Stamped before notifying, so a delivery failure cannot put the lead in a re-notify loop.
    expect(updates).toHaveLength(1)
    expect(updates[0]?.patch).toEqual({
      last_follow_up_reminder_at: new Date(NOW_MS).toISOString(),
    })
    expect(result.reminded).toBe(1)
    expect(result.notified).toBe(0)
    expect(result.errors).toEqual(['lead-1 notify: notify exploded'])
  })

  it('stamps an unassigned lead without notifying anyone', async () => {
    const { supabase, updates } = mockSupabase([dueLead({ assigned_to: null })])

    const result = await runContactFollowUpCron(supabase as never, { nowMs: NOW_MS })

    expect(updates).toHaveLength(1)
    expect(result.reminded).toBe(1)
    expect(result.notified).toBe(0)
    expect(result.errors).toEqual([])
    expect(insertTrustedFollowUpReminder).not.toHaveBeenCalled()
  })

  it('returns zero counts when no leads are due', async () => {
    const { supabase } = mockSupabase([])
    const result = await runContactFollowUpCron(supabase as never)
    expect(result).toEqual({
      checked: 0,
      reminded: 0,
      lost: 0,
      notified: 0,
      remaining: 0,
      errors: [],
    })
  })

  it('caps reminders at 12 and reports remaining for the next tick', async () => {
    const leads = Array.from({ length: 15 }, (_, i) => ({
      id: `lead-${String(i).padStart(2, '0')}`,
      org_id: 'org-1',
      name: `Lead ${i}`,
      service_type: 'TV Aerial',
      status: 'contact_attempted',
      assigned_to: 'tech-1',
      contact_attempt_round: 1,
      last_contact_attempted_at: new Date(
        NOW_MS - CONTACT_FOLLOW_UP_MS - (15 - i) * 60_000
      ).toISOString(),
    }))
    const { supabase, updates } = mockSupabase(leads)

    const result = await runContactFollowUpCron(supabase as never, { nowMs: NOW_MS })

    expect(result.checked).toBe(15)
    expect(result.reminded).toBe(12)
    expect(result.notified).toBe(12)
    expect(result.remaining).toBe(3)
    expect(result.lost).toBe(0)
    expect(updates).toHaveLength(12)
    expect(
      updates.every(
        (row) => row.patch.last_follow_up_reminder_at === new Date(NOW_MS).toISOString()
      )
    ).toBe(true)
    expect(updates.map((row) => row.id)).toEqual([
      'lead-00', 'lead-01', 'lead-02', 'lead-03', 'lead-04', 'lead-05',
      'lead-06', 'lead-07', 'lead-08', 'lead-09', 'lead-10', 'lead-11',
    ])
    expect(insertTrustedFollowUpReminder).toHaveBeenCalledTimes(12)
    expect(insertTrustedFollowUpReminder.mock.calls.map((call) => call[0].leadId)).toEqual([
      'lead-00', 'lead-01', 'lead-02', 'lead-03', 'lead-04', 'lead-05',
      'lead-06', 'lead-07', 'lead-08', 'lead-09', 'lead-10', 'lead-11',
    ])
  })
})
