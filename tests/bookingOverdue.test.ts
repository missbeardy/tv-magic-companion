import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  BOOKING_NUDGE_TITLES,
  BOOKING_OVERDUE_GRACE_MS,
  buildEmployeeBookingNudge,
  buildManagerBookingDigest,
  isBookingOverdue,
  latestBookingByLead,
} from '../shared/bookingOverdue'
import { sortLeadsForKanbanColumn } from '../shared/contactFollowUp'
import { runBookingOverdueSweep } from '../api/_lib/bookingOverdue'

const insertTrustedBookingNudge = vi.fn()

vi.mock('../api/_lib/notifyUser.js', () => ({
  insertTrustedBookingNudge: (...args: unknown[]) => insertTrustedBookingNudge(...args),
}))
vi.mock('../api/_lib/log.js', () => ({ log: { info: () => {} } }))

const HOUR = 3_600_000
// 10am Brisbane (UTC+10) — inside the 8am–8pm window.
const NOW = new Date('2026-10-01T00:00:00.000Z')
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString()

describe('isBookingOverdue', () => {
  it('is false before the grace period has passed', () => {
    expect(isBookingOverdue('booked', iso(-BOOKING_OVERDUE_GRACE_MS + 60_000), NOW.getTime())).toBe(false)
  })
  it('is true once the grace period has passed', () => {
    expect(isBookingOverdue('booked', iso(-BOOKING_OVERDUE_GRACE_MS), NOW.getTime())).toBe(true)
  })
  it('only applies to booked leads with a booking', () => {
    expect(isBookingOverdue('completed', iso(-48 * HOUR), NOW.getTime())).toBe(false)
    expect(isBookingOverdue('booked', null, NOW.getTime())).toBe(false)
  })
})

describe('latestBookingByLead', () => {
  it('keeps the booking that ends last, so a reschedule into the future clears overdue', () => {
    const map = latestBookingByLead([
      { id: 'old', lead_id: 'a', start_time: iso(-50 * HOUR), end_time: iso(-48 * HOUR) },
      { id: 'new', lead_id: 'a', start_time: iso(24 * HOUR), end_time: iso(26 * HOUR) },
      { lead_id: null, start_time: iso(0), end_time: iso(HOUR) },
    ])
    expect(map.size).toBe(1)
    expect(map.get('a')).toMatchObject({ eventId: 'new', start: iso(24 * HOUR) })
  })
})

describe('nudge copy', () => {
  it('names and deep-links a single overdue job', () => {
    const nudge = buildEmployeeBookingNudge([{ id: 'l1', name: 'Jane', start: iso(-26 * HOUR) }])
    expect(nudge).toMatchObject({ title: BOOKING_NUDGE_TITLES.employeeSingle, url: '/leads?lead=l1', leadId: 'l1' })
    expect(nudge.message).toMatch(/^Jane was booked for/)
  })
  it('rolls several jobs into one message naming the oldest', () => {
    const nudge = buildEmployeeBookingNudge([
      { id: 'l1', name: 'Newer', start: iso(-26 * HOUR) },
      { id: 'l2', name: 'Oldest', start: iso(-200 * HOUR) },
    ])
    expect(nudge).toMatchObject({ title: BOOKING_NUDGE_TITLES.employeeMany, url: '/leads' })
    expect(nudge.leadId).toBeUndefined()
    expect(nudge.message).toMatch(/^2 of your booked jobs have passed \(oldest: Oldest,/)
  })
  it('pluralises the manager digest', () => {
    expect(buildManagerBookingDigest(1).message).toMatch(/^1 booked job has/)
    expect(buildManagerBookingDigest(3).message).toMatch(/^3 booked jobs have/)
  })
})

describe('sortLeadsForKanbanColumn booked', () => {
  it('puts the earliest booking first and undated leads last', () => {
    const sorted = sortLeadsForKanbanColumn(
      [
        { id: 'none', status: 'booked', booking_start_at: null },
        { id: 'future', status: 'booked', booking_start_at: iso(24 * HOUR) },
        { id: 'past', status: 'booked', booking_start_at: iso(-72 * HOUR) },
      ] as never[],
      'booked'
    ) as { id: string }[]
    expect(sorted.map((l) => l.id)).toEqual(['past', 'future', 'none'])
  })
})

interface FakeData {
  leads: Record<string, unknown>[]
  events: Record<string, unknown>[]
  orgs?: Record<string, unknown>[]
  managers?: Record<string, unknown>[]
  /** user ids that already have a nudge inside the cooldown */
  recentlyNudged?: string[]
}

function fakeSupabase(data: FakeData) {
  function builder(resolveRows: (filters: Record<string, unknown>) => unknown[]) {
    const filters: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'is', 'not', 'in', 'gte', 'limit']) b[m] = () => b
    b.eq = (col: string, val: unknown) => {
      filters[col] = val
      return b
    }
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: resolveRows(filters), error: null })
    return b
  }
  const supabase = {
    from(table: string) {
      if (table === 'leads') return builder(() => data.leads)
      if (table === 'events') return builder(() => data.events)
      if (table === 'orgs') return builder(() => data.orgs ?? [{ id: 'org1', timezone: 'Australia/Brisbane' }])
      if (table === 'profiles') return builder(() => data.managers ?? [])
      if (table === 'notifications') {
        return builder((f) => ((data.recentlyNudged ?? []).includes(f.user_id as string) ? [{ id: 'n' }] : []))
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return supabase as never
}

const lead = (id: string, assignedTo: string | null = 'emp1') => ({
  id,
  org_id: 'org1',
  name: `Customer ${id}`,
  assigned_to: assignedTo,
})
const event = (leadId: string, endOffsetMs: number) => ({
  lead_id: leadId,
  start_time: iso(endOffsetMs - 2 * HOUR),
  end_time: iso(endOffsetMs),
})

describe('runBookingOverdueSweep', () => {
  beforeEach(() => {
    insertTrustedBookingNudge.mockReset()
    insertTrustedBookingNudge.mockResolvedValue({ ok: true })
  })

  it('nudges the assignee once for a single overdue booking, ignoring future ones', async () => {
    const result = await runBookingOverdueSweep(
      fakeSupabase({
        leads: [lead('past'), lead('future')],
        events: [event('past', -24 * HOUR), event('future', 24 * HOUR)],
      }),
      NOW
    )
    expect(result).toMatchObject({ overdue: 1, employeesNudged: 1, digests: 0, errors: [] })
    expect(insertTrustedBookingNudge).toHaveBeenCalledTimes(1)
    expect(insertTrustedBookingNudge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'emp1', leadId: 'past', url: '/leads?lead=past' })
    )
  })

  it('rolls a backlog into ONE notification per employee', async () => {
    const leads = Array.from({ length: 55 }, (_, i) => lead(`k${i}`, 'kyle'))
    leads.push(lead('j1', 'jordan'), lead('j2', 'jordan'))
    const events = leads.map((l, i) => event(l.id, -(24 + i) * HOUR))
    const result = await runBookingOverdueSweep(fakeSupabase({ leads, events }), NOW)
    expect(result).toMatchObject({ overdue: 57, employeesNudged: 2 })
    expect(insertTrustedBookingNudge).toHaveBeenCalledTimes(2)
    expect(insertTrustedBookingNudge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'kyle', url: '/leads', message: expect.stringMatching(/^55 of your/) })
    )
  })

  it('skips people already nudged inside the cooldown', async () => {
    const result = await runBookingOverdueSweep(
      fakeSupabase({
        leads: [lead('a'), lead('b', 'emp2')],
        events: [event('a', -24 * HOUR), event('b', -24 * HOUR)],
        recentlyNudged: ['emp1'],
      }),
      NOW
    )
    expect(result).toMatchObject({ overdue: 2, employeesNudged: 1 })
    expect(insertTrustedBookingNudge).toHaveBeenCalledWith(expect.objectContaining({ userId: 'emp2' }))
  })

  it('sends each manager one digest counting unassigned jobs too, unless one went out recently', async () => {
    const base = {
      leads: [lead('a', null), lead('b', null)],
      events: [event('a', -24 * HOUR), event('b', -48 * HOUR)],
      managers: [{ id: 'mgr1' }, { id: 'mgr2' }],
    }
    const first = await runBookingOverdueSweep(fakeSupabase({ ...base, recentlyNudged: ['mgr2'] }), NOW)
    expect(first).toMatchObject({ employeesNudged: 0, digests: 1 })
    expect(insertTrustedBookingNudge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'mgr1', title: BOOKING_NUDGE_TITLES.manager, message: expect.stringMatching(/^2 booked jobs/) })
    )
  })

  it('stays silent outside business hours', async () => {
    // 2am Brisbane
    const night = new Date('2026-09-30T16:00:00.000Z')
    const result = await runBookingOverdueSweep(
      fakeSupabase({ leads: [lead('past')], events: [event('past', -24 * HOUR)], managers: [{ id: 'mgr1' }] }),
      night
    )
    expect(result).toMatchObject({ overdue: 1, employeesNudged: 0, digests: 0 })
    expect(insertTrustedBookingNudge).not.toHaveBeenCalled()
  })
})
