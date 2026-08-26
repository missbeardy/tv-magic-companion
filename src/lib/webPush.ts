import { supabase } from './supabase'

/**
 * T1.12 — client side of self-hosted Web Push (VAPID).
 *
 * Subscriptions are written straight to `push_subscriptions` under RLS
 * (`auth.uid() = user_id`), so this costs no Vercel function slot — the Hobby cap
 * is at 12/12. Only the service worker's session-less `pushsubscriptionchange`
 * needs a server endpoint.
 *
 * Every function here degrades silently and returns a status rather than throwing.
 * A notification failure must never break a render or a lead write.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type EnablePushResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'unconfigured' | 'denied' | 'ios-not-installed' | 'error' }

/** Decode a URL-safe base64 VAPID key into the byte array `subscribe()` expects.
 *  Typed against a plain ArrayBuffer so it satisfies `applicationServerKey`, which
 *  does not accept a SharedArrayBuffer-backed view. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

function uint8ToUrlBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * True when an existing subscription was created under a different VAPID public
 * key than the one we ship today.
 *
 * A PushSubscription is cryptographically bound to the key it was created with, so
 * a mismatch means the server can never deliver to it — the push service rejects
 * our signature. This happens whenever the keypair is regenerated, and it is silent
 * unless we check: the subscription still looks perfectly healthy client-side.
 */
function isStaleKey(subscription: PushSubscription): boolean {
  const raw = subscription.options?.applicationServerKey
  if (!raw || !VAPID_PUBLIC_KEY) return false
  try {
    return uint8ToUrlBase64(new Uint8Array(raw)) !== VAPID_PUBLIC_KEY.replace(/=+$/, '')
  } catch {
    return false
  }
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function isWebPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY)
}

/**
 * Safari 16.4+ supports Web Push, but only from a PWA launched off the Home
 * Screen. In an ordinary iOS Safari tab `Notification` may not exist at all, so
 * the enable button must be replaced by an install prompt rather than left to fail.
 *
 * Handles iPadOS masquerading as `MacIntel` and excludes Chrome/Firefox/Edge on iOS,
 * none of which expose push.
 */
export function isIosSafariNotInstalled(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return false

  const ua = nav.userAgent
  const isIos =
    /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return isIos && isSafari
}

/**
 * Does this user still have a row for `endpoint`?
 *
 * `null` means the lookup itself failed, which is NOT the same as "no row" — the
 * sender deletes a row only when the push service says the endpoint is gone, so a
 * missing row is a real signal and a failed query is no signal at all. Callers must
 * treat the two differently or a flaky network reads as a broken device.
 */
async function serverRowExists(userId: string, endpoint: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .maybeSingle()

  if (error) {
    console.error('Push subscription lookup failed (non-fatal):', error.message)
    return null
  }
  return Boolean(data)
}

/**
 * Whether this device can actually receive a push right now.
 *
 * Browser permission is not the answer: it stays `granted` long after the row that
 * makes delivery possible has been pruned, which is how a device ends up showing
 * "notifications are enabled" while receiving nothing. Returns `null` when it cannot
 * tell — never treat that as "broken".
 */
export async function isDeviceSubscribed(userId: string): Promise<boolean | null> {
  if (!isPushSupported() || !isWebPushConfigured()) return null

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return false
    return await serverRowExists(userId, subscription.endpoint)
  } catch (err) {
    console.error('isDeviceSubscribed failed (non-fatal):', err)
    return null
  }
}

async function syncSubscription(
  subscription: PushSubscription,
  userId: string,
  orgId: string | null
): Promise<boolean> {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

  // endpoint is UNIQUE, so upserting on it keeps *the same* endpoint idempotent.
  // It does NOT dedupe a rotation: the browser hands us a brand-new endpoint, which
  // inserts a second row and orphans the first. iOS drops subscriptions often, so on
  // one iPhone that produced 69 rows in eleven days — and because the sender fans out
  // to every row a user owns, flipping `native_web_push` on would have pushed 69
  // copies of one lead alert to one phone. pruneStaleDeviceRows below is what keeps
  // this table at one row per device.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      org_id: orgId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
      failure_count: 0,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )

  if (error) {
    console.error('Push subscription sync failed (non-fatal):', error.message)
    return false
  }

  await pruneStaleDeviceRows(userId, json.endpoint, navigator.userAgent)
  return true
}

/**
 * Delete the rows this device left behind when the browser rotated its subscription.
 *
 * Scoped deliberately tightly, because a false positive here silently costs someone
 * their notifications:
 *   - same `user_id` and same `user_agent` — never another person, never another device
 *   - never the row we just wrote
 *   - `last_success_at is null` only — a row that has ever delivered is left alone
 *     even if it looks redundant
 *
 * Best-effort: a failure here leaks a row, which the server-side fan-out cap in
 * `api/_lib/webPush.ts` already contains. It must never fail the sync.
 */
async function pruneStaleDeviceRows(
  userId: string,
  keepEndpoint: string,
  userAgent: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('user_agent', userAgent)
      .neq('endpoint', keepEndpoint)
      .is('last_success_at', null)

    if (error) console.error('Push subscription prune failed (non-fatal):', error.message)
  } catch (err) {
    console.error('Push subscription prune threw (non-fatal):', err)
  }
}

/**
 * Subscribe this device and record it server-side.
 *
 * MUST be called from inside a real user-gesture handler — iOS rejects
 * `requestPermission()` outside one.
 */
export async function enablePush(
  userId: string,
  orgId: string | null
): Promise<EnablePushResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: isIosSafariNotInstalled() ? 'ios-not-installed' : 'unsupported' }
  }
  if (!isWebPushConfigured()) return { ok: false, reason: 'unconfigured' }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: 'denied' }

    const registration = await navigator.serviceWorker.ready

    // A subscription bound to a different applicationServerKey — OneSignal's, for
    // anyone migrating — makes subscribe() reject with InvalidStateError.
    const existing = await registration.pushManager.getSubscription()
    if (existing) await existing.unsubscribe()

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // required; silent push is not permitted
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
    })

    const synced = await syncSubscription(subscription, userId, orgId)
    if (!synced) return { ok: false, reason: 'error' }

    // Clear the opt-out as well as setting the flag — otherwise a user who once turned
    // notifications off could never turn them back on: reconcileSubscription would keep
    // bailing on the stale push_disabled_at and undo this on the next app load.
    await supabase
      .from('profiles')
      .update({ push_enabled: true, push_disabled_at: null })
      .eq('id', userId)
    return { ok: true }
  } catch (err) {
    console.error('enablePush failed (non-fatal):', err)
    return { ok: false, reason: 'error' }
  }
}

/** Unsubscribe this device and delete its server row. */
export async function disablePush(userId: string): Promise<void> {
  try {
    // Stamping push_disabled_at is what makes this an *explicit* opt-out that
    // reconcileSubscription will honour on every subsequent load. push_enabled is kept in
    // sync only for clients deployed before v1.1.181.
    await supabase
      .from('profiles')
      .update({ push_enabled: false, push_disabled_at: new Date().toISOString() })
      .eq('id', userId)

    if (!isPushSupported()) return
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return

    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    await subscription.unsubscribe()
  } catch (err) {
    console.error('disablePush failed (non-fatal):', err)
  }
}

/**
 * Call on every app load once a user is known.
 *
 * Repairs the two ways a subscription silently rots: the server lost the row, or
 * the browser rotated the subscription while the app was closed. Cheap, idempotent,
 * and the reason the whole thing is self-healing rather than decaying over months.
 */
export async function reconcileSubscription(
  userId: string,
  orgId: string | null
): Promise<void> {
  if (!isPushSupported() || !isWebPushConfigured()) return
  if (Notification.permission !== 'granted') return

  try {
    // Honour an explicit opt-out. Browser permission stays "granted" after we
    // unsubscribe — without this check, every app load would re-create the row
    // the user just deleted via Profile → Turn off.
    // Read push_disabled_at, NOT push_enabled. push_enabled is a boolean defaulting to
    // false, so it cannot distinguish "explicitly turned off" from "never asked" — and
    // while native_web_push was off nothing ever set it, so every user read as a refusal
    // and could never be migrated off OneSignal. push_disabled_at is written only by
    // disablePush(), so null genuinely means "no opt-out recorded".
    const { data: prefs } = await supabase
      .from('profiles')
      .select('push_disabled_at')
      .eq('id', userId)
      .maybeSingle()
    if (prefs?.push_disabled_at) return

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    // Bound to a key we no longer hold the private half of — undeliverable. Tear it
    // down so the re-subscribe below issues one we can actually sign for.
    if (subscription && isStaleKey(subscription)) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
      await subscription.unsubscribe()
      subscription = null
    }

    // Permission is granted but no subscription exists — typically a user who
    // granted under OneSignal's key and has just been migrated. Re-subscribe under
    // ours without prompting: permission is origin-scoped, not per-key.
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      })
    } else if ((await serverRowExists(userId, subscription.endpoint)) === false) {
      // The sender deletes the row the moment the push service reports this endpoint
      // gone (404/410), but the browser keeps handing the dead subscription back. A
      // plain upsert would resurrect the row, the next send would prune it again, and
      // the device would silently receive nothing forever. The missing row is the only
      // signal we get, so spend it on a fresh endpoint.
      //
      // Strictly `=== false`: serverRowExists returns null when the query failed, and
      // churning subscriptions on a flaky network would be worse than doing nothing.
      await subscription.unsubscribe()
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      })
    }

    await syncSubscription(subscription, userId, orgId)
  } catch (err) {
    console.error('reconcileSubscription failed (non-fatal):', err)
  }
}
