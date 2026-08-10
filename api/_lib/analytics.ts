import { PostHog } from 'posthog-node'
import { waitUntil } from '@vercel/functions'
import {
  assertNoForbiddenKeys,
  type AnalyticsEvent,
  type AnalyticsEventProperties,
} from '../../shared/analyticsEvents.js'

let client: PostHog | null = null
let attemptedInit = false

function getClient(): PostHog | null {
  if (attemptedInit) return client
  attemptedInit = true
  const key = process.env.POSTHOG_PROJECT_TOKEN
  if (!key) return null
  // flushAt: 1 / flushInterval: 0 — send immediately, don't wait to batch. `waitUntil` is
  // posthog-node's documented Vercel integration point: it lets the SDK extend the serverless
  // invocation's lifetime for the background flush after the response is already sent, instead
  // of the app code having to await it inline. No-ops safely outside real Vercel infra (e.g.
  // local `vercel dev`), so this is always safe to pass.
  client = new PostHog(key, {
    host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
    waitUntil,
  })
  return client
}

/**
 * distinctId is the leadId for every lead-lifecycle event (see shared/analyticsEvents.ts
 * LEAD_LIFECYCLE_EVENTS) so the lead_captured -> invoice_paid funnel connects across every
 * event for the same lead, or the profile id for `login`. Never pass a customer
 * name/phone/email as distinctId.
 */
export function track<E extends AnalyticsEvent>(
  event: E,
  distinctId: string,
  properties: AnalyticsEventProperties[E]
): void {
  const c = getClient()
  if (!c) return
  assertNoForbiddenKeys(properties)
  c.capture({ distinctId, event, properties })
}

const FLUSH_TIMEOUT_MS = 3000

/**
 * Best-effort with a hard timeout: `client.flush()` can hang indefinitely when the network
 * silently drops outbound connections (observed locally — Node fetch to PostHog's IPs
 * ETIMEDOUT while curl to the same URL succeeded). Analytics must never be able to hang or
 * fail a real request, whatever the cause, so this races the flush against a timeout and
 * swallows failures rather than awaiting unbounded.
 */
export async function flushAnalytics(): Promise<void> {
  if (!client) return
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS))
  try {
    await Promise.race([client.flush(), timeout])
  } catch {
    // never surface an analytics failure into the request path
  }
}
