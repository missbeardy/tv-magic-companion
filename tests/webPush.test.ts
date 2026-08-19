import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const sendNotification = vi.fn()
const setVapidDetails = vi.fn()

vi.mock('web-push', () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  },
}))

const { sendWebPushToUsers, isWebPushConfigured, WEB_PUSH_SOURCE, capPerUser } = await import(
  '../api/_lib/webPush.js'
)

interface Row {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
  last_seen_at: string | null
}

/** Records every write the sender makes so we can assert its bookkeeping. */
interface Recorder {
  updates: { patch: Record<string, unknown>; ids: string[] }[]
  deletes: string[][]
}

function makeSupabase(rows: Row[], recorder: Recorder): SupabaseClient {
  const client = {
    from(table: string) {
      if (table !== 'push_subscriptions') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          in: () => ({
            lt: () => ({
              // The sender orders newest-seen first so capPerUser drops the right rows.
              order: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          in: (_col: string, ids: string[]) => {
            recorder.updates.push({ patch, ids })
            return Promise.resolve({ error: null })
          },
          eq: (_col: string, id: string) => {
            recorder.updates.push({ patch, ids: [id] })
            return Promise.resolve({ error: null })
          },
        }),
        delete: () => ({
          in: (_col: string, ids: string[]) => {
            recorder.deletes.push(ids)
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  }
  return client as unknown as SupabaseClient
}

function row(id: string, failure_count = 0, user_id = 'u1'): Row {
  return {
    id,
    user_id,
    endpoint: `https://push.example/${id}`,
    p256dh: 'p',
    auth: 'a',
    failure_count,
    last_seen_at: null,
  }
}

function webPushError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`status ${statusCode}`), { statusCode })
}

const PAYLOAD = { title: 'New Unassigned Lead', body: 'Jane needs assigning.' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VAPID_PUBLIC_KEY = 'pub'
  process.env.VAPID_PRIVATE_KEY = 'priv'
  process.env.VAPID_SUBJECT = 'mailto:ops@example.com'
})

describe('isWebPushConfigured', () => {
  it('requires all three VAPID vars', () => {
    expect(isWebPushConfigured()).toBe(true)
    delete process.env.VAPID_PRIVATE_KEY
    expect(isWebPushConfigured()).toBe(false)
  })
})

describe('sendWebPushToUsers', () => {
  it('reports zero attempted when unconfigured, so the caller can fall back', async () => {
    delete process.env.VAPID_SUBJECT
    const recorder: Recorder = { updates: [], deletes: [] }
    const result = await sendWebPushToUsers(
      makeSupabase([row('s1')], recorder),
      ['u1'],
      PAYLOAD
    )
    expect(result).toEqual({ attempted: 0, sent: 0, expired: 0 })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('reports zero attempted when the user has no subscriptions', async () => {
    const recorder: Recorder = { updates: [], deletes: [] }
    const result = await sendWebPushToUsers(makeSupabase([], recorder), ['u1'], PAYLOAD)
    expect(result.attempted).toBe(0)
  })

  it('tags the payload so the service worker can tell it from a OneSignal push', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 })
    const recorder: Recorder = { updates: [], deletes: [] }
    await sendWebPushToUsers(makeSupabase([row('s1')], recorder), ['u1'], {
      ...PAYLOAD,
      url: '/leads?highlight=abc',
      leadId: 'abc',
    })

    const body = JSON.parse(sendNotification.mock.calls[0][1] as string)
    expect(body.src).toBe(WEB_PUSH_SOURCE)
    expect(body.title).toBe('New Unassigned Lead')
    expect(body.url).toBe('/leads?highlight=abc')
    expect(body.lead_id).toBe('abc')
  })

  it('on success stamps last_success_at and resets failure_count', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 })
    const recorder: Recorder = { updates: [], deletes: [] }
    const result = await sendWebPushToUsers(
      makeSupabase([row('s1'), row('s2')], recorder),
      ['u1'],
      PAYLOAD
    )

    expect(result).toEqual({ attempted: 2, sent: 2, expired: 0 })
    expect(recorder.updates).toHaveLength(1)
    expect(recorder.updates[0].ids).toEqual(['s1', 's2'])
    expect(recorder.updates[0].patch.failure_count).toBe(0)
    expect(recorder.updates[0].patch.last_success_at).toBeTruthy()
    expect(recorder.deletes).toHaveLength(0)
  })

  it('deletes the row on 410 Gone — a dead subscription is not an error', async () => {
    sendNotification.mockRejectedValue(webPushError(410))
    const recorder: Recorder = { updates: [], deletes: [] }
    const result = await sendWebPushToUsers(makeSupabase([row('s1')], recorder), ['u1'], PAYLOAD)

    expect(result).toEqual({ attempted: 1, sent: 0, expired: 1 })
    expect(recorder.deletes).toEqual([['s1']])
  })

  it('deletes the row on 404 as well', async () => {
    sendNotification.mockRejectedValue(webPushError(404))
    const recorder: Recorder = { updates: [], deletes: [] }
    const result = await sendWebPushToUsers(makeSupabase([row('s1')], recorder), ['u1'], PAYLOAD)

    expect(result.expired).toBe(1)
    expect(recorder.deletes).toEqual([['s1']])
  })

  it('increments failure_count on 429 rather than deleting', async () => {
    sendNotification.mockRejectedValue(webPushError(429))
    const recorder: Recorder = { updates: [], deletes: [] }
    const result = await sendWebPushToUsers(
      makeSupabase([row('s1', 1)], recorder),
      ['u1'],
      PAYLOAD
    )

    expect(result).toEqual({ attempted: 1, sent: 0, expired: 0 })
    expect(recorder.deletes).toHaveLength(0)
    expect(recorder.updates).toEqual([{ patch: { failure_count: 2 }, ids: ['s1'] }])
  })

  it('increments failure_count on 500', async () => {
    sendNotification.mockRejectedValue(webPushError(500))
    const recorder: Recorder = { updates: [], deletes: [] }
    await sendWebPushToUsers(makeSupabase([row('s1', 0)], recorder), ['u1'], PAYLOAD)
    expect(recorder.updates).toEqual([{ patch: { failure_count: 1 }, ids: ['s1'] }])
  })

  it('does not retry or delete on 401 — bad VAPID keys are our bug, not a dead sub', async () => {
    sendNotification.mockRejectedValue(webPushError(401))
    const recorder: Recorder = { updates: [], deletes: [] }
    const result = await sendWebPushToUsers(makeSupabase([row('s1')], recorder), ['u1'], PAYLOAD)

    expect(result).toEqual({ attempted: 1, sent: 0, expired: 0 })
    expect(recorder.deletes).toHaveLength(0)
    expect(recorder.updates).toHaveLength(0)
  })

  it('handles a mixed batch without letting one failure sink the others', async () => {
    sendNotification
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce(webPushError(410))
      .mockRejectedValueOnce(webPushError(429))
    const recorder: Recorder = { updates: [], deletes: [] }
    const result = await sendWebPushToUsers(
      makeSupabase([row('s1'), row('s2'), row('s3')], recorder),
      ['u1'],
      PAYLOAD
    )

    expect(result).toEqual({ attempted: 3, sent: 1, expired: 1 })
    expect(recorder.deletes).toEqual([['s2']])
  })

  it('never throws when the subscription lookup fails', async () => {
    const client = {
      from: () => ({
        select: () => ({
          in: () => ({
            lt: () => ({
              order: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient

    await expect(sendWebPushToUsers(client, ['u1'], PAYLOAD)).resolves.toEqual({
      attempted: 0,
      sent: 0,
      expired: 0,
    })
  })
})

describe('capPerUser — fan-out ceiling', () => {
  const sub = (user_id: string, endpoint: string, last_seen_at: string | null = null) =>
    ({
      id: endpoint,
      user_id,
      endpoint,
      p256dh: 'k',
      auth: 'a',
      failure_count: 0,
      last_seen_at,
    })

  it('keeps every row when a user is under the cap', () => {
    const rows = [sub('u1', 'e1'), sub('u1', 'e2'), sub('u2', 'e3')]
    expect(capPerUser(rows).map((r) => r.endpoint)).toEqual(['e1', 'e2', 'e3'])
  })

  it('caps a leaked device at five endpoints instead of fanning out to all of them', () => {
    // The real prod case: one iPhone had 69 rows. Uncapped, one lead alert would
    // have pushed 69 copies to that phone.
    const rows = Array.from({ length: 69 }, (_, i) => sub('u1', `e${i}`))
    const kept = capPerUser(rows)
    expect(kept).toHaveLength(5)
    expect(kept.map((r) => r.endpoint)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4'])
  })

  it('caps each user independently, so one leaky device cannot starve a colleague', () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => sub('leaky', `l${i}`)),
      sub('clean', 'c1'),
    ]
    const kept = capPerUser(rows)
    expect(kept.filter((r) => r.user_id === 'leaky')).toHaveLength(5)
    expect(kept.filter((r) => r.user_id === 'clean')).toHaveLength(1)
  })

  it('honours the caller ordering, so newest-seen rows survive the cap', () => {
    const rows = [
      sub('u1', 'newest', '2026-08-19T00:00:00Z'),
      sub('u1', 'older', '2026-08-01T00:00:00Z'),
      ...Array.from({ length: 10 }, (_, i) => sub('u1', `ancient${i}`, null)),
    ]
    const kept = capPerUser(rows)
    expect(kept[0].endpoint).toBe('newest')
    expect(kept[1].endpoint).toBe('older')
    expect(kept).toHaveLength(5)
  })

  it('returns an empty list unchanged', () => {
    expect(capPerUser([])).toEqual([])
  })
})
