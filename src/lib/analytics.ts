import posthog from 'posthog-js'
import {
  assertNoForbiddenKeys,
  type AnalyticsEventProperties,
  type ClientRelayedEvent,
} from '../../shared/analyticsEvents'
import { getAuthHeaders } from './apiAuth'

let initialized = false

/** No-ops cleanly when VITE_POSTHOG_PROJECT_TOKEN is unset (local dev without keys). */
export function initAnalytics(): void {
  if (initialized) return
  const key = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN
  if (!key) return

  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    person_profiles: 'identified_only',
  })
  initialized = true
}

/** Call once after an interactive login succeeds — the `login` event's distinct_id. */
export function identifyStaff(profileId: string): void {
  if (!initialized) return
  posthog.identify(profileId)
}

/** `login` is the only client-captured event — every lead-lifecycle event relays server-side
 * (see trackViaRelay below) so it can use leadId as distinct_id, which posthog-js can't do
 * per-call without corrupting the staff member's persistent identity. */
export function trackLogin(properties: AnalyticsEventProperties['login']): void {
  if (!initialized) return
  assertNoForbiddenKeys(properties)
  posthog.capture('login', properties)
}

/**
 * Relays a client-originated lead-lifecycle event through POST /api/leads?action=analytics-track
 * so the server can capture it with distinctId=leadId, consistent with every other lead-lifecycle
 * event (see shared/analyticsEvents.ts CLIENT_RELAYED_EVENTS). Fire-and-forget — analytics must
 * never block or fail the actual write it's describing.
 */
export async function trackViaRelay<E extends ClientRelayedEvent>(
  event: E,
  properties: AnalyticsEventProperties[E]
): Promise<void> {
  assertNoForbiddenKeys(properties)
  try {
    const headers = await getAuthHeaders()
    if (!headers.Authorization) return
    await fetch('/api/leads?action=analytics-track', {
      method: 'POST',
      headers,
      body: JSON.stringify({ event, properties }),
    })
  } catch {
    // best-effort — never surface an analytics failure to the user
  }
}
