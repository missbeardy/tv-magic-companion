import type { SupabaseClient } from '@supabase/supabase-js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { sendWebPushToUsers, type WebPushPayload } from './webPush.js'

/**
 * T1.12 — the single seam every push send goes through.
 *
 * Dual-run router. Which transport carries a notification is a per-brand switch
 * (`native_web_push`), so rollback is one toggle in Platform Admin rather than a
 * redeploy.
 *
 * The important property is the *per-recipient* fallback: turning the switch on
 * for a brand must not black out a user who simply has not reopened the app since
 * the deploy and therefore has no VAPID subscription yet. If Web Push finds
 * nothing to send to, OneSignal still carries the message.
 */

export type PushTransport = 'web-push' | 'onesignal' | 'none'

export interface PushSendResult {
  transport: PushTransport
  sent: number
  /** Set when Web Push was selected but had no live subscriptions to send to. */
  fellBack?: boolean
}

/** Best-effort OneSignal REST send — the legacy path, unchanged in behaviour. */
async function sendViaOneSignal(
  userIds: string[],
  payload: WebPushPayload
): Promise<number> {
  const appId = process.env.ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_API_KEY
  if (!appId || !apiKey || !userIds.length) return 0

  let sent = 0
  for (const userId of userIds) {
    try {
      await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${apiKey}`,
        },
        body: JSON.stringify({
          app_id: appId,
          target_channel: 'push',
          include_aliases: { external_id: [userId] },
          headings: { en: payload.title },
          contents: { en: payload.body },
          ...(payload.url ? { url: payload.url } : {}),
        }),
      })
      sent += 1
    } catch (err) {
      console.error(`OneSignal push failed for ${userId} (non-fatal):`, err)
    }
  }
  return sent
}

/**
 * Push to one or more users in an org, over whichever transport that org's brand
 * is configured for. Never throws.
 */
export async function sendPushToUsers(
  supabase: SupabaseClient,
  orgId: string,
  userIds: string[],
  payload: WebPushPayload
): Promise<PushSendResult> {
  const recipients = userIds.filter(Boolean)
  if (!recipients.length) return { transport: 'none', sent: 0 }

  let nativeEnabled = false
  try {
    nativeEnabled = await isFeatureEnabledForOrg(orgId, 'native_web_push')
  } catch (err) {
    // Fail back to the known-good transport rather than dropping the notification.
    console.error('[PUSH_TRANSPORT] switch lookup failed, using OneSignal:', err)
  }

  if (!nativeEnabled) {
    return { transport: 'onesignal', sent: await sendViaOneSignal(recipients, payload) }
  }

  const result = await sendWebPushToUsers(supabase, recipients, payload)
  if (result.attempted > 0) {
    return { transport: 'web-push', sent: result.sent }
  }

  // Nobody has subscribed under our VAPID key yet — keep them on OneSignal until
  // they reopen the app and reconcileSubscription() registers them.
  return {
    transport: 'onesignal',
    sent: await sendViaOneSignal(recipients, payload),
    fellBack: true,
  }
}
