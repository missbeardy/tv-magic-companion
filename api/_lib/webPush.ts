import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * T1.12 — self-hosted Web Push sender (VAPID).
 *
 * This is the thing OneSignal was doing for us: sign a JWT with our VAPID private
 * key and POST an encrypted payload directly to the endpoint URL the browser gave
 * us. No relay, no third-party outage surface.
 *
 * Deliberately not a Vercel route — the Hobby function cap is at 12/12, so this is
 * an `_lib` module called in-process by the existing hubs.
 */

/** Marks a payload as ours. `public/sw.js` ignores anything without it, so the
 *  handler does not double-render OneSignal pushes while both systems are live. */
export const WEB_PUSH_SOURCE = 'fb'

export interface WebPushPayload {
  title: string
  body: string
  url?: string
  /** Same tag replaces rather than stacks — used to collapse duplicates. */
  tag?: string
  leadId?: string
}

export interface WebPushResult {
  /** Live subscription rows found. Zero means "this user has not subscribed yet",
   *  which is what makes the OneSignal fallback in pushTransport.ts fire. */
  attempted: number
  sent: number
  /** Rows deleted because the push service reported the subscription gone. */
  expired: number
}

interface SubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
  last_seen_at: string | null
}

const EMPTY_RESULT: WebPushResult = { attempted: 0, sent: 0, expired: 0 }

/** Max consecutive soft failures before a row stops being selected for sending. */
const MAX_FAILURES = 3

/**
 * Hard ceiling on endpoints contacted per user per send.
 *
 * A browser that rotates its subscription leaves the old row behind, so this table
 * grows one row per rotation per device unless something prunes it. The client-side
 * prune in `src/lib/webPush.ts` is the real fix, but it only runs when that user
 * next opens the app — so without a cap here, one lead alert could fan out to dozens
 * of endpoints on a single phone. Newest-seen rows win; a genuine multi-device user
 * has nowhere near this many.
 */
const MAX_ENDPOINTS_PER_USER = 5

/** Seconds the push service holds an undelivered message. */
const TTL_SECONDS = 60 * 60 * 24

export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  )
}

/**
 * Keep only the newest `MAX_ENDPOINTS_PER_USER` rows per user.
 *
 * Input must already be ordered newest-first. Exported for tests: the cap is the
 * thing standing between a leaked subscription table and a notification flood.
 */
export function capPerUser(rows: SubscriptionRow[]): SubscriptionRow[] {
  const seen = new Map<string, number>()
  const kept: SubscriptionRow[] = []
  let dropped = 0

  for (const row of rows) {
    const n = seen.get(row.user_id) ?? 0
    if (n >= MAX_ENDPOINTS_PER_USER) {
      dropped++
      continue
    }
    seen.set(row.user_id, n + 1)
    kept.push(row)
  }

  if (dropped > 0) {
    console.warn(
      `[WEB_PUSH] capped fan-out: skipped ${dropped} stale endpoint(s) beyond ${MAX_ENDPOINTS_PER_USER}/user`
    )
  }
  return kept
}

/**
 * Deliver to every live subscription belonging to `userIds`.
 *
 * Never throws — every push call site in this repo treats push as best-effort and
 * must keep doing so. A notification failure may not break a lead write.
 */
export async function sendWebPushToUsers(
  supabase: SupabaseClient,
  userIds: string[],
  payload: WebPushPayload
): Promise<WebPushResult> {
  if (!userIds.length || !isWebPushConfigured()) return EMPTY_RESULT

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, failure_count, last_seen_at')
    .in('user_id', userIds)
    .lt('failure_count', MAX_FAILURES)
    .order('last_seen_at', { ascending: false, nullsFirst: false })

  if (error) {
    console.error('[WEB_PUSH] subscription lookup failed:', error.message)
    return EMPTY_RESULT
  }

  const subs = capPerUser((data ?? []) as SubscriptionRow[])
  if (!subs.length) return EMPTY_RESULT

  let webpush: typeof import('web-push')
  try {
    const mod = await import('web-push')
    webpush = (mod.default ?? mod) as typeof import('web-push')
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )
  } catch (err) {
    console.error('[WEB_PUSH] web-push unavailable:', err)
    return EMPTY_RESULT
  }

  // Kept well under the ~4KB payload cap Apple enforces strictly: ids and short
  // strings only, and the client fetches detail on click.
  const body = JSON.stringify({
    src: WEB_PUSH_SOURCE,
    v: 1,
    title: payload.title,
    body: payload.body,
    ...(payload.url ? { url: payload.url } : {}),
    ...(payload.tag ? { tag: payload.tag } : {}),
    ...(payload.leadId ? { lead_id: payload.leadId } : {}),
  })

  const expired: string[] = []
  const succeeded: string[] = []
  const softFailed: SubscriptionRow[] = []

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: TTL_SECONDS, ...(payload.tag ? { topic: payload.tag.slice(0, 32) } : {}) }
        )
        succeeded.push(sub.id)
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // Subscription is gone. Not an error — this is the pruning OneSignal
          // was doing for us. Leave these rows and the table rots.
          expired.push(sub.id)
        } else if (status === 400 || status === 401 || status === 403 || status === 413) {
          // Our bug, not theirs: malformed request, bad VAPID keys/subject, or an
          // oversized payload. Retrying cannot help, so log loudly instead.
          console.error(`[WEB_PUSH_FATAL] status ${status} for subscription ${sub.id}`)
        } else {
          // 429 / 5xx — push service throttling or down. Count it; three strikes
          // and the row drops out of the send query.
          softFailed.push(sub)
        }
      }
    })
  )

  try {
    if (succeeded.length) {
      await supabase
        .from('push_subscriptions')
        .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
        .in('id', succeeded)
    }
    if (expired.length) {
      await supabase.from('push_subscriptions').delete().in('id', expired)
    }
    for (const sub of softFailed) {
      await supabase
        .from('push_subscriptions')
        .update({ failure_count: sub.failure_count + 1 })
        .eq('id', sub.id)
    }
  } catch (err) {
    console.error('[WEB_PUSH] subscription bookkeeping failed (non-fatal):', err)
  }

  return { attempted: subs.length, sent: succeeded.length, expired: expired.length }
}
