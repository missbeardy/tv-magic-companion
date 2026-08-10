import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { loadLocalEnvIfNeeded } from './loadLocalEnv.js'
import { safeCompareSecret } from './timingSafeCompare.js'
import { sendWebPushToUsers, type WebPushPayload } from './webPush.js'

/**
 * T1.12 — the two Web Push endpoints that cannot go through Supabase RLS.
 *
 * Everything else (subscribe, unsubscribe, reconcile) is a direct client write to
 * `push_subscriptions` under RLS, which costs no Vercel function slot. These two
 * are the exceptions, and they live on the send-sms hub because the Hobby
 * function cap is at 12/12.
 */

interface SubscriptionJson {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

/**
 * `pushsubscriptionchange` — the browser rotated a subscription while the app was
 * closed, so the service worker re-subscribed and is reporting the new endpoint.
 *
 * A service worker has no Supabase session, so this cannot be RLS-guarded.
 * Authorisation is possession of `oldEndpoint`: a push endpoint URL is an
 * unguessable, capability-bearing secret issued by the push service, and only the
 * SW that owned the subscription knows it. The update is scoped to that one row
 * and carries over its existing `user_id` — a caller cannot point a subscription
 * at a different user.
 */
export async function handlePushRotate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return res.status(503).json({ error: 'Server not configured' })

  const { oldEndpoint, subscription } = (req.body ?? {}) as {
    oldEndpoint?: string
    subscription?: SubscriptionJson
  }

  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth
  if (!oldEndpoint || !endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'Invalid subscription' })
  }

  try {
    const { data: existing } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, org_id')
      .eq('endpoint', oldEndpoint)
      .maybeSingle()

    if (!existing) {
      // Nothing to rotate. The client's reconcileSubscription() on next app open
      // will insert a fresh row under a real session.
      return res.status(404).json({ error: 'Unknown subscription' })
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .update({
        endpoint,
        p256dh,
        auth,
        failure_count: 0,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (error) throw new Error(error.message)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[PUSH_ROTATE_FAILED]', err)
    return res.status(500).json({ error: 'Rotation failed' })
  }
}

function isPushSendAuthorized(req: VercelRequest): boolean {
  loadLocalEnvIfNeeded()
  const secret = process.env.PUSH_SHARED_SECRET?.trim()
  // Fail closed in every environment: no secret configured means no access.
  if (!secret) return false
  const header = req.headers['x-push-secret']
  const provided = Array.isArray(header) ? header[0] : header
  return safeCompareSecret(provided, secret)
}

/**
 * Internal send-on-behalf-of endpoint for the `notify-message` Supabase Edge
 * Function, which runs on Deno and cannot host the sender itself without a second
 * copy of the VAPID keys and a bet on Deno's node-crypto compatibility.
 *
 * Not reachable by app clients: shared-secret only, fail-closed.
 */
export async function handlePushSend(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isPushSendAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return res.status(503).json({ error: 'Server not configured' })

  const { userIds, payload } = (req.body ?? {}) as {
    userIds?: string[]
    payload?: WebPushPayload
  }

  if (!Array.isArray(userIds) || !userIds.length || !payload?.title || !payload?.body) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  try {
    const result = await sendWebPushToUsers(supabase, userIds, payload)
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    console.error('[PUSH_SEND_FAILED]', err)
    return res.status(500).json({ error: 'Send failed' })
  }
}
