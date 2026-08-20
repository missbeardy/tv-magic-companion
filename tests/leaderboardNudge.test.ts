import { beforeEach, describe, expect, it, vi } from 'vitest'

const isFeatureEnabledForOrg = vi.fn()
const sendPushToUsers = vi.fn()

vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: (...args: unknown[]) => isFeatureEnabledForOrg(...args),
}))

vi.mock('../api/_lib/pushTransport.js', () => ({
  sendPushToUsers: (...args: unknown[]) => sendPushToUsers(...args),
}))

vi.mock('../api/_lib/platformUrl.js', () => ({
  getPlatformUrl: () => 'https://app.test',
}))

import { runLeaderboardNudge } from '../api/_lib/leaderboardNudge'

/** Monday 24 Aug 08:00 Sydney — reveals the week that opened Mon 17 Aug. */
const REVEAL_TIME = new Date('2026-08-23T22:00:00Z')
/** Saturday 22 Aug 17:00 Sydney — reminds about the week it sits in (Mon 17 Aug). */
const REMIND_TIME = new Date('2026-08-22T07:00:00Z')
const WEEK = '2026-08-17'

interface TableData {
  orgs: Record<string, unknown>[]
  entries: Record<string, unknown>[]
  profiles: Record<string, unknown>[]
  notifications: Record<string, unknown>[]
}

interface Inserted {
  table: string
  rows: Record<string, unknown>[]
}

function mockSupabase(data: Partial<TableData> = {}, options: { insertError?: string } = {}) {
  const tables: TableData = {
    orgs: data.orgs ?? [{ id: 'org-1' }],
    entries: data.entries ?? [],
    profiles: data.profiles ?? [],
    notifications: data.notifications ?? [],
  }
  const inserted: Inserted[] = []
  const queries: Record<string, unknown>[] = []

  // Mirrors the PostgREST builder: filters return the builder, the chain is awaited last.
  function builder(table: string) {
    const filters: Record<string, unknown> = { table }
    queries.push(filters)

    const self: Record<string, unknown> = {
      select: () => self,
      eq: (col: string, val: unknown) => {
        filters[`eq:${col}`] = val
        return self
      },
      in: (col: string, val: unknown) => {
        filters[`in:${col}`] = val
        return self
      },
      gte: (col: string, val: unknown) => {
        filters[`gte:${col}`] = val
        return self
      },
      or: (expr: string) => {
        filters.or = expr
        return self
      },
      is: (col: string, val: unknown) => {
        filters[`is:${col}`] = val
        return self
      },
      insert: (rows: Record<string, unknown>[]) => {
        if (options.insertError) {
          return Promise.resolve({ error: { message: options.insertError } })
        }
        inserted.push({ table, rows })
        return Promise.resolve({ error: null })
      },
      then: (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) => {
        let rows: Record<string, unknown>[] = []
        if (table === 'orgs') rows = tables.orgs
        if (table === 'weekly_leaderboard_entries') rows = tables.entries
        if (table === 'profiles') {
          const roles = (filters['in:role'] as string[]) ?? []
          rows = tables.profiles.filter(
            (p) =>
              roles.includes(p.role as string) &&
              !('is:departed_at' in filters && p.departed_at)
          )
        }
        if (table === 'notifications') {
          const type = filters['eq:type'] as string
          const users = (filters['in:user_id'] as string[]) ?? []
          // The created_at filter is honoured, not ignored: the whole point of the
          // dedupe window is which side of it a previous send falls on.
          const since = filters['gte:created_at']
            ? new Date(filters['gte:created_at'] as string).getTime()
            : Number.NEGATIVE_INFINITY
          rows = tables.notifications.filter(
            (n) =>
              n.type === type &&
              users.includes(n.user_id as string) &&
              new Date((n.created_at as string) ?? 0).getTime() >= since
          )
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      },
    }
    return self
  }

  return {
    client: { from: (table: string) => builder(table) } as never,
    inserted,
    queries,
  }
}

const EMPLOYEES = [
  { id: 'tech-1', role: 'employee' },
  { id: 'tech-2', role: 'employee' },
]
const MANAGERS = [{ id: 'mgr-1', role: 'manager' }]

beforeEach(() => {
  vi.clearAllMocks()
  isFeatureEnabledForOrg.mockResolvedValue(true)
  sendPushToUsers.mockResolvedValue({ transport: 'none', sent: 0 })
})

describe('runLeaderboardNudge — when it stays quiet', () => {
  it('does nothing outside the phase window', async () => {
    const { client, inserted } = mockSupabase()
    const result = await runLeaderboardNudge(client, 'reveal', {
      now: new Date('2026-08-24T03:00:00Z'), // Monday 1pm Sydney, not 8am
    })

    expect(result.inWindow).toBe(false)
    expect(result.notified).toBe(0)
    expect(inserted).toHaveLength(0)
    // The switch is not even consulted — no work is started at all.
    expect(isFeatureEnabledForOrg).not.toHaveBeenCalled()
  })

  it('sends nothing when the brand switch is off', async () => {
    isFeatureEnabledForOrg.mockResolvedValue(false)
    const { client, inserted } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: EMPLOYEES,
    })

    const result = await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })
    expect(result.orgs).toBe(0)
    expect(result.notified).toBe(0)
    expect(inserted).toHaveLength(0)
  })

  it('never reveals an empty board — that is what teaches people to ignore it', async () => {
    const { client, inserted } = mockSupabase({ entries: [], profiles: EMPLOYEES })

    const result = await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })
    expect(result.skippedNoResults).toBe(1)
    expect(result.notified).toBe(0)
    expect(inserted).toHaveLength(0)
  })

  it('never reveals a board that is posted but all zeros', async () => {
    const { client } = mockSupabase({
      entries: [{ jobs_completed: 0, sales_amount: 0 }],
      profiles: EMPLOYEES,
    })

    const result = await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })
    expect(result.skippedNoResults).toBe(1)
    expect(result.notified).toBe(0)
  })

  it('does not remind a manager who already posted the week', async () => {
    const { client } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: MANAGERS,
    })

    const result = await runLeaderboardNudge(client, 'remind', { now: REMIND_TIME })
    expect(result.skippedNoResults).toBe(1)
    expect(result.notified).toBe(0)
  })

  it('skips an org with nobody to notify', async () => {
    const { client } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: [],
    })

    const result = await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })
    expect(result.skippedNoRecipients).toBe(1)
    expect(result.notified).toBe(0)
  })
})

describe('runLeaderboardNudge — the reveal', () => {
  it('notifies every employee with a deep link that plays the reveal', async () => {
    const { client, inserted } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: [...EMPLOYEES, ...MANAGERS],
    })

    const result = await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })

    expect(result.notified).toBe(2)
    expect(result.weekStart).toBe(WEEK)

    const rows = inserted.find((i) => i.table === 'notifications')?.rows ?? []
    expect(rows.map((r) => r.user_id)).toEqual(['tech-1', 'tech-2'])
    expect(rows[0]).toMatchObject({ type: 'leaderboard_reveal', org_id: 'org-1', read: false })

    expect(sendPushToUsers).toHaveBeenCalledTimes(1)
    const payload = sendPushToUsers.mock.calls[0][3]
    expect(payload.url).toBe(`https://app.test/leaderboard?reveal=1&week=${WEEK}`)
  })

  it('goes to the team only — managers are not on the board', async () => {
    const { client, inserted } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: [...EMPLOYEES, ...MANAGERS],
    })

    await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })
    const rows = inserted.find((i) => i.table === 'notifications')?.rows ?? []
    expect(rows.map((r) => r.user_id)).not.toContain('mgr-1')
  })

  it('leaves hidden test profiles out of the send', async () => {
    const { client, queries } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: EMPLOYEES,
    })

    await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })
    const profileQuery = queries.find((q) => q.table === 'profiles')
    expect(profileQuery?.or).toContain('is_hidden_test_profile')
  })

  it('reads the week that has just closed, not the one starting today', async () => {
    const { client, queries } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: EMPLOYEES,
    })

    await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })
    const entryQuery = queries.find((q) => q.table === 'weekly_leaderboard_entries')
    expect(entryQuery?.['eq:week_start']).toBe(WEEK)
    expect(entryQuery?.['eq:org_id']).toBe('org-1')
  })
})

describe('runLeaderboardNudge — the manager reminder', () => {
  it('nudges managers only while the board is still empty', async () => {
    const { client, inserted } = mockSupabase({
      entries: [],
      profiles: [...EMPLOYEES, ...MANAGERS],
    })

    const result = await runLeaderboardNudge(client, 'remind', { now: REMIND_TIME })

    expect(result.notified).toBe(1)
    const rows = inserted.find((i) => i.table === 'notifications')?.rows ?? []
    expect(rows.map((r) => r.user_id)).toEqual(['mgr-1'])
    expect(rows[0]).toMatchObject({ type: 'leaderboard_remind' })

    const payload = sendPushToUsers.mock.calls[0][3]
    expect(payload.url).toBe('https://app.test/leaderboard')
  })
})

describe('runLeaderboardNudge — not sending twice', () => {
  it('skips anyone already notified this week', async () => {
    const { client, inserted } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: EMPLOYEES,
      notifications: [
        { user_id: 'tech-1', type: 'leaderboard_reveal', created_at: REVEAL_TIME.toISOString() },
      ],
    })

    const result = await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })

    expect(result.skippedAlreadySent).toBe(1)
    expect(result.notified).toBe(1)
    const rows = inserted.find((i) => i.table === 'notifications')?.rows ?? []
    expect(rows.map((r) => r.user_id)).toEqual(['tech-2'])
  })

  it('sends nothing at all when the whole team already has it', async () => {
    const { client, inserted } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: EMPLOYEES,
      notifications: [
        { user_id: 'tech-1', type: 'leaderboard_reveal', created_at: REVEAL_TIME.toISOString() },
        { user_id: 'tech-2', type: 'leaderboard_reveal', created_at: REVEAL_TIME.toISOString() },
      ],
    })

    const result = await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })
    expect(result.notified).toBe(0)
    expect(inserted).toHaveLength(0)
    expect(sendPushToUsers).not.toHaveBeenCalled()
  })

  it('anchors the dedupe window to the send, not to the week being scored', async () => {
    const { client, queries } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: EMPLOYEES,
    })

    await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })
    const notifQuery = queries.find((q) => q.table === 'notifications')
    // Three days back from the send — well clear of last Monday's reveal.
    expect(notifQuery?.['gte:created_at']).toBe('2026-08-20T22:00:00.000Z')
  })

  it('does not let last week’s reveal suppress this week’s', async () => {
    // The reveal celebrates a week that ended before it runs, so a dedupe window keyed on
    // the scored week would reach back over the previous send and silence every reveal
    // after the very first one. This is that regression.
    const lastMonday = new Date(REVEAL_TIME)
    lastMonday.setUTCDate(lastMonday.getUTCDate() - 7)

    const { client, queries } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: EMPLOYEES,
      notifications: [
        { user_id: 'tech-1', type: 'leaderboard_reveal', created_at: lastMonday.toISOString() },
        { user_id: 'tech-2', type: 'leaderboard_reveal', created_at: lastMonday.toISOString() },
      ],
    })

    const result = await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })

    const notifQuery = queries.find((q) => q.table === 'notifications')
    const since = new Date(notifQuery?.['gte:created_at'] as string)
    expect(since.getTime()).toBeGreaterThan(lastMonday.getTime())
    expect(result.notified).toBe(2)
  })

  it('does not mistake a reminder for a reveal', async () => {
    const { client } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: EMPLOYEES,
      notifications: [
        { user_id: 'tech-1', type: 'leaderboard_remind', created_at: REVEAL_TIME.toISOString() },
        { user_id: 'tech-2', type: 'leaderboard_remind', created_at: REVEAL_TIME.toISOString() },
      ],
    })

    const result = await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })
    expect(result.notified).toBe(2)
  })
})

describe('runLeaderboardNudge — failure handling', () => {
  it('records a failed org without taking the sweep down', async () => {
    const { client } = mockSupabase(
      {
        orgs: [{ id: 'org-1' }],
        entries: [{ jobs_completed: 4, sales_amount: 900 }],
        profiles: EMPLOYEES,
      },
      { insertError: 'notifications table is on fire' }
    )

    const result = await runLeaderboardNudge(client, 'reveal', { now: REVEAL_TIME })

    expect(result.notified).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('notifications table is on fire')
  })

  it('force bypasses the hour guard for an on-demand send', async () => {
    const { client } = mockSupabase({
      entries: [{ jobs_completed: 4, sales_amount: 900 }],
      profiles: EMPLOYEES,
    })

    const result = await runLeaderboardNudge(client, 'reveal', {
      now: new Date('2026-08-19T03:00:00Z'), // a Wednesday lunchtime
      force: true,
    })

    expect(result.inWindow).toBe(true)
    expect(result.notified).toBe(2)
  })
})
