import { describe, expect, it, vi, beforeEach } from 'vitest'
import { runContactFollowUpCron } from '../api/_lib/runContactFollowUpCron'
import { CONTACT_FOLLOW_UP_MS } from '../shared/contactFollowUp'

const notifyOrgUser = vi.fn()

vi.mock('../api/_lib/notifyUser.js', () => ({
  notifyOrgUser: (...args: unknown[]) => notifyOrgUser(...args),
}))

function mockSupabase(leads: Record<string, unknown>[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  const events: Record<string, unknown>[] = []

  const supabase = {
    from(table: string) {
      if (table === 'leads') {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                lte: async () => ({ data: leads, error: null }),
              }),
            }),
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

  return { supabase, updates, events }
}

describe('runContactFollowUpCron', () => {
  beforeEach(() => {
    notifyOrgUser.mockReset()
    notifyOrgUser.mockResolvedValue({ ok: true })
  })

  it('reminds assignee on stale contact_attempted leads without changing round', async () => {
    const nowMs = Date.parse('2026-07-01T12:00:00Z')
    const staleAt = new Date(nowMs - CONTACT_FOLLOW_UP_MS - 60_000).toISOString()
    const { supabase, updates, events } = mockSupabase([
      {
        id: 'lead-1',
        org_id: 'org-1',
        name: 'Jane Doe',
        service_type: 'TV Aerial',
        status: 'contact_attempted',
        assigned_to: 'tech-1',
        contact_attempt_round: 1,
        last_contact_attempted_at: staleAt,
      },
    ])

    const result = await runContactFollowUpCron(supabase as never, { nowMs })

    expect(result.checked).toBe(1)
    expect(result.reminded).toBe(1)
    expect(result.lost).toBe(0)
    expect(result.notified).toBe(1)
    expect(updates).toHaveLength(0)
    expect(events).toHaveLength(0)
    expect(notifyOrgUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'tech-1',
        type: 'contact_follow_up',
        title: 'Lead needs 2nd Attempt',
      })
    )
  })

  it('auto-lost final-round leads without notification', async () => {
    const nowMs = Date.parse('2026-07-01T12:00:00Z')
    const staleAt = new Date(nowMs - CONTACT_FOLLOW_UP_MS - 60_000).toISOString()
    const { supabase, updates, events } = mockSupabase([
      {
        id: 'lead-2',
        org_id: 'org-1',
        name: 'Bob',
        service_type: 'General',
        status: 'contact_attempted',
        assigned_to: 'tech-1',
        contact_attempt_round: 4,
        last_contact_attempted_at: staleAt,
      },
    ])

    const result = await runContactFollowUpCron(supabase as never, { nowMs })

    expect(result.lost).toBe(1)
    expect(result.reminded).toBe(0)
    expect(updates[0]?.patch.status).toBe('lost')
    expect(updates[0]?.patch.lost_reason).toBe('unable_to_contact')
    expect(events[0]?.event_type).toBe('lost')
    expect(notifyOrgUser).not.toHaveBeenCalled()
  })

  it('returns zero counts when no leads are due', async () => {
    const { supabase } = mockSupabase([])
    const result = await runContactFollowUpCron(supabase as never)
    expect(result).toEqual({
      checked: 0,
      reminded: 0,
      lost: 0,
      notified: 0,
      errors: [],
    })
  })
})
