import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const isFeatureEnabledForOrg = vi.fn()
const sendWebPushToUsers = vi.fn()

vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: (...args: unknown[]) => isFeatureEnabledForOrg(...args),
}))

vi.mock('../api/_lib/webPush.js', () => ({
  sendWebPushToUsers: (...args: unknown[]) => sendWebPushToUsers(...args),
}))

const { sendPushToUsers } = await import('../api/_lib/pushTransport.js')

const supabase = {} as SupabaseClient
const PAYLOAD = { title: 'New Unassigned Lead', body: 'Jane needs assigning.' }

function oneSignalCalls() {
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
    String(c[0]).includes('onesignal.com')
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ONESIGNAL_APP_ID = 'app'
  process.env.ONESIGNAL_API_KEY = 'key'
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
})

describe('sendPushToUsers', () => {
  it('uses OneSignal when the brand switch is off', async () => {
    isFeatureEnabledForOrg.mockResolvedValue(false)

    const result = await sendPushToUsers(supabase, 'org1', ['u1'], PAYLOAD)

    expect(result.transport).toBe('onesignal')
    expect(result.sent).toBe(1)
    expect(sendWebPushToUsers).not.toHaveBeenCalled()
    expect(oneSignalCalls()).toHaveLength(1)
  })

  it('uses Web Push when the brand switch is on and subscriptions exist', async () => {
    isFeatureEnabledForOrg.mockResolvedValue(true)
    sendWebPushToUsers.mockResolvedValue({ attempted: 2, sent: 2, expired: 0 })

    const result = await sendPushToUsers(supabase, 'org1', ['u1', 'u2'], PAYLOAD)

    expect(result).toEqual({ transport: 'web-push', sent: 2 })
    expect(oneSignalCalls()).toHaveLength(0)
  })

  it('falls back to OneSignal when the switch is on but nobody has subscribed yet', async () => {
    // The safety property of the whole design: flipping the switch must not black
    // out a user who has not reopened the app since the deploy.
    isFeatureEnabledForOrg.mockResolvedValue(true)
    sendWebPushToUsers.mockResolvedValue({ attempted: 0, sent: 0, expired: 0 })

    const result = await sendPushToUsers(supabase, 'org1', ['u1'], PAYLOAD)

    expect(result).toEqual({ transport: 'onesignal', sent: 1, fellBack: true })
    expect(oneSignalCalls()).toHaveLength(1)
  })

  it('does NOT fall back when Web Push tried and every send failed', async () => {
    // attempted > 0 means the user is subscribed; a delivery failure is a delivery
    // failure, not a reason to double-send via the old transport.
    isFeatureEnabledForOrg.mockResolvedValue(true)
    sendWebPushToUsers.mockResolvedValue({ attempted: 1, sent: 0, expired: 1 })

    const result = await sendPushToUsers(supabase, 'org1', ['u1'], PAYLOAD)

    expect(result).toEqual({ transport: 'web-push', sent: 0 })
    expect(oneSignalCalls()).toHaveLength(0)
  })

  it('falls back to OneSignal when the switch lookup itself throws', async () => {
    isFeatureEnabledForOrg.mockRejectedValue(new Error('db down'))

    const result = await sendPushToUsers(supabase, 'org1', ['u1'], PAYLOAD)

    expect(result.transport).toBe('onesignal')
    expect(oneSignalCalls()).toHaveLength(1)
  })

  it('sends one OneSignal request per recipient, aliased by external_id', async () => {
    isFeatureEnabledForOrg.mockResolvedValue(false)

    await sendPushToUsers(supabase, 'org1', ['u1', 'u2'], { ...PAYLOAD, url: '/leads' })

    const calls = oneSignalCalls()
    expect(calls).toHaveLength(2)
    const body = JSON.parse((calls[0][1] as RequestInit).body as string)
    expect(body.include_aliases).toEqual({ external_id: ['u1'] })
    expect(body.headings).toEqual({ en: 'New Unassigned Lead' })
    expect(body.url).toBe('/leads')
  })

  it('is a no-op with no recipients', async () => {
    const result = await sendPushToUsers(supabase, 'org1', [], PAYLOAD)
    expect(result).toEqual({ transport: 'none', sent: 0 })
    expect(isFeatureEnabledForOrg).not.toHaveBeenCalled()
  })

  it('never throws when a OneSignal request fails', async () => {
    isFeatureEnabledForOrg.mockResolvedValue(false)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch

    await expect(sendPushToUsers(supabase, 'org1', ['u1'], PAYLOAD)).resolves.toEqual({
      transport: 'onesignal',
      sent: 0,
    })
  })
})
