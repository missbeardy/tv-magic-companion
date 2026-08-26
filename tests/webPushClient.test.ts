import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * Client-side push opt-in/opt-out semantics (v1.1.181).
 *
 * The bug these lock down: `profiles.push_enabled` is a boolean defaulting to false, so
 * `reconcileSubscription` could not tell "explicitly turned off" from "never asked". While
 * `native_web_push` was off nothing ever wrote it, so all eight TV Magic profiles read as
 * refusals and none could migrate off OneSignal. `push_disabled_at` replaces it as the
 * opt-out signal precisely because NULL is unambiguous.
 */

const VAPID = 'BJ3rF9pQ7kZ2mN8xY4tV6wA1sD5fG0hJ9kL3nM7pQ2rS4tU6vW8xY0zA2bC4dE6fG8h'
vi.stubEnv('VITE_VAPID_PUBLIC_KEY', VAPID)

// ── Supabase mock: records every call so we can assert what was read and written ──
interface Recorded {
  selects: string[]
  updates: Record<string, unknown>[]
  upserts: Record<string, unknown>[]
  deleteFilters: Record<string, unknown>[]
}
const rec: Recorded = { selects: [], updates: [], upserts: [], deleteFilters: [] }
let profileRow: Record<string, unknown> = { push_disabled_at: null }
/** What a push_subscriptions lookup returns. `error` non-null is the "cannot tell" case. */
let subscriptionLookup: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
}

function makeFrom(table: string) {
  if (table === 'profiles') {
    return {
      select: (cols: string) => {
        rec.selects.push(cols)
        return {
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: profileRow, error: null }) }),
        }
      },
      update: (patch: Record<string, unknown>) => {
        rec.updates.push(patch)
        return { eq: () => Promise.resolve({ error: null }) }
      },
    }
  }
  if (table === 'push_subscriptions') {
    return {
      select: (cols: string) => {
        rec.selects.push(cols)
        const chain = {
          eq: () => chain,
          maybeSingle: () => Promise.resolve(subscriptionLookup),
        }
        return chain
      },
      upsert: (row: Record<string, unknown>) => {
        rec.upserts.push(row)
        return Promise.resolve({ error: null })
      },
      delete: () => {
        const filters: Record<string, unknown> = {}
        rec.deleteFilters.push(filters)
        const chain = {
          eq: (col: string, val: unknown) => {
            filters[`eq:${col}`] = val
            return chain
          },
          neq: (col: string, val: unknown) => {
            filters[`neq:${col}`] = val
            return chain
          },
          is: (col: string, val: unknown) => {
            filters[`is:${col}`] = val
            return Promise.resolve({ error: null })
          },
        }
        return chain
      },
    }
  }
  throw new Error(`unexpected table ${table}`)
}

vi.mock('../src/lib/supabase', () => ({ supabase: { from: (t: string) => makeFrom(t) } }))

const { reconcileSubscription, disablePush, isDeviceSubscribed } = await import(
  '../src/lib/webPush'
)

// ── Browser surface ──
const subscribe = vi.fn()
const getSubscription = vi.fn()
const unsubscribe = vi.fn()

function subscriptionAt(endpoint: string) {
  return {
    endpoint,
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256', auth: 'auth' } }),
    unsubscribe,
  }
}

beforeEach(() => {
  rec.selects.length = 0
  rec.updates.length = 0
  rec.upserts.length = 0
  rec.deleteFilters.length = 0
  profileRow = { push_disabled_at: null }
  subscriptionLookup = { data: { id: 'row1' }, error: null }
  subscribe.mockReset()
  getSubscription.mockReset()
  unsubscribe.mockReset()

  setPermission('granted')
  vi.stubGlobal('navigator', {
    userAgent: 'TestAgent/1.0 (iPhone)',
    serviceWorker: {
      ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }),
    },
  })
})

/**
 * isPushSupported() gates on `'Notification' in window` as well as the global, so both have
 * to move together — stubbing only the global silently makes every test pass vacuously.
 */
function setPermission(permission: NotificationPermission) {
  const notification = { permission }
  vi.stubGlobal('Notification', notification)
  vi.stubGlobal('window', { PushManager: class {}, Notification: notification, atob, btoa })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reconcileSubscription — opt-out semantics', () => {
  it('subscribes a user who has never opted out', async () => {
    // The case that was broken: push_disabled_at null means "no opinion recorded",
    // NOT "no". Previously push_enabled === false blocked this for everyone.
    getSubscription.mockResolvedValue(null)
    subscribe.mockResolvedValue(subscriptionAt('https://push.example/new'))

    await reconcileSubscription('u1', 'org1')

    expect(rec.selects).toContain('push_disabled_at')
    expect(subscribe).toHaveBeenCalledOnce()
    expect(rec.upserts).toHaveLength(1)
    expect(rec.upserts[0]).toMatchObject({
      user_id: 'u1',
      org_id: 'org1',
      endpoint: 'https://push.example/new',
    })
  })

  it('never reads push_enabled — the column that could not express "never asked"', async () => {
    getSubscription.mockResolvedValue(null)
    subscribe.mockResolvedValue(subscriptionAt('https://push.example/new'))

    await reconcileSubscription('u1', 'org1')

    expect(rec.selects.join(',')).not.toContain('push_enabled')
  })

  it('honours an explicit opt-out and does not resubscribe', async () => {
    profileRow = { push_disabled_at: '2026-08-01T00:00:00.000Z' }
    getSubscription.mockResolvedValue(null)

    await reconcileSubscription('u1', 'org1')

    expect(subscribe).not.toHaveBeenCalled()
    expect(rec.upserts).toHaveLength(0)
  })

  it('does nothing when the browser has not granted permission', async () => {
    setPermission('default')

    await reconcileSubscription('u1', 'org1')

    expect(subscribe).not.toHaveBeenCalled()
    expect(rec.upserts).toHaveLength(0)
  })
})

describe('pruneStaleDeviceRows — via reconcileSubscription', () => {
  it('deletes only this device rows that never delivered, keeping the new one', async () => {
    getSubscription.mockResolvedValue(null)
    subscribe.mockResolvedValue(subscriptionAt('https://push.example/current'))

    await reconcileSubscription('u1', 'org1')

    expect(rec.deleteFilters).toHaveLength(1)
    expect(rec.deleteFilters[0]).toEqual({
      'eq:user_id': 'u1',
      'eq:user_agent': 'TestAgent/1.0 (iPhone)',
      'neq:endpoint': 'https://push.example/current',
      // A row that has ever delivered is left alone even if it looks redundant — a false
      // positive here silently costs someone their notifications.
      'is:last_success_at': null,
    })
  })
})

describe('disablePush — records a real opt-out', () => {
  it('stamps push_disabled_at so reconcile stops resubscribing', async () => {
    getSubscription.mockResolvedValue(subscriptionAt('https://push.example/current'))

    await disablePush('u1')

    expect(rec.updates).toHaveLength(1)
    expect(rec.updates[0].push_enabled).toBe(false)
    expect(typeof rec.updates[0].push_disabled_at).toBe('string')
  })
})

/**
 * Found on prod 26-08-2026: Demo Manager's Profile page showed "Notifications are enabled
 * on this device" while that device could not receive one. The sender deletes a row the
 * moment the push service reports the endpoint gone (404/410), but the browser keeps
 * handing back the dead PushSubscription — so reconcile upserted it straight back and the
 * next send pruned it again. A rot loop that reports success at every step.
 */
describe('reconcileSubscription — a pruned endpoint is replaced, not resurrected', () => {
  it('re-subscribes when the browser holds a subscription the server has no row for', async () => {
    getSubscription.mockResolvedValue(subscriptionAt('https://push.example/dead'))
    subscribe.mockResolvedValue(subscriptionAt('https://push.example/fresh'))
    subscriptionLookup = { data: null, error: null }

    await reconcileSubscription('u1', 'org1')

    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    expect(rec.upserts).toHaveLength(1)
    expect(rec.upserts[0]).toMatchObject({ endpoint: 'https://push.example/fresh' })
  })

  it('leaves a subscription alone when its row is still there', async () => {
    getSubscription.mockResolvedValue(subscriptionAt('https://push.example/live'))
    subscriptionLookup = { data: { id: 'row1' }, error: null }

    await reconcileSubscription('u1', 'org1')

    expect(subscribe).not.toHaveBeenCalled()
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(rec.upserts[0]).toMatchObject({ endpoint: 'https://push.example/live' })
  })

  it('does nothing when the lookup itself failed — unknown is not missing', async () => {
    // Churning a working device's subscription on every flaky query would be worse than
    // the bug this branch exists to fix.
    getSubscription.mockResolvedValue(subscriptionAt('https://push.example/live'))
    subscriptionLookup = { data: null, error: { message: 'network down' } }

    await reconcileSubscription('u1', 'org1')

    expect(subscribe).not.toHaveBeenCalled()
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(rec.upserts[0]).toMatchObject({ endpoint: 'https://push.example/live' })
  })
})

describe('isDeviceSubscribed — what the Profile panel trusts instead of permission', () => {
  it('is false when the browser has no subscription at all', async () => {
    getSubscription.mockResolvedValue(null)

    expect(await isDeviceSubscribed('u1')).toBe(false)
  })

  it('is true when this endpoint still has a row', async () => {
    getSubscription.mockResolvedValue(subscriptionAt('https://push.example/live'))
    subscriptionLookup = { data: { id: 'row1' }, error: null }

    expect(await isDeviceSubscribed('u1')).toBe(true)
  })

  it('is false when the row was pruned — the state that showed a green banner', async () => {
    getSubscription.mockResolvedValue(subscriptionAt('https://push.example/dead'))
    subscriptionLookup = { data: null, error: null }

    expect(await isDeviceSubscribed('u1')).toBe(false)
  })

  it('is null, not false, when the lookup failed', async () => {
    getSubscription.mockResolvedValue(subscriptionAt('https://push.example/live'))
    subscriptionLookup = { data: null, error: { message: 'network down' } }

    expect(await isDeviceSubscribed('u1')).toBeNull()
  })

  it('is null when push is not supported at all', async () => {
    vi.stubGlobal('window', { Notification: { permission: 'granted' }, atob, btoa })

    expect(await isDeviceSubscribed('u1')).toBeNull()
  })
})
