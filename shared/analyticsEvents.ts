/** Server-safe product analytics event contract — no Vite/env imports. Shared by api/ and src/. */

export const ANALYTICS_EVENTS = [
  'lead_captured',
  'ack_sent',
  'quote_sent',
  'quote_accepted',
  'booking_created',
  'job_completed',
  'invoice_sent',
  'invoice_paid',
  'review_sent',
  'offline_queue_flush_failed',
  'extraction_fallback_used',
  'login',
] as const

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number]

/**
 * Every event's properties are ids, enums, booleans, or counts only — never a free-form
 * Record<string, unknown> and never a raw lead/customer object. This is what makes it
 * structurally impossible to accidentally pass a name/phone/address/photo URL through.
 */
export interface AnalyticsEventProperties {
  lead_captured: { orgId: string; leadId: string; source: string }
  ack_sent: { orgId: string; leadId: string; channel: 'sms' | 'email' }
  quote_sent: { orgId: string; leadId: string; quoteId: string; emailSent: boolean; smsSent: boolean }
  quote_accepted: { orgId: string; leadId: string; quoteId: string }
  booking_created: { orgId: string; leadId: string; eventId: string }
  job_completed: { orgId: string; leadId: string; source: 'online' | 'offline_queue_sync' }
  invoice_sent: { orgId: string; leadId: string; invoiceId: string }
  invoice_paid: { orgId: string; leadId: string; invoiceId: string; paidVia: 'manual' | 'stripe' }
  review_sent: { orgId: string; leadId: string }
  offline_queue_flush_failed: { orgId: string; leadId: string; itemType: string }
  extraction_fallback_used: { orgId: string; leadId: string; channel: 'sms' | 'email' }
  login: { orgId: string; role: string }
}

/**
 * PostHog funnels group by distinct_id. Every lead-lifecycle event uses the leadId as
 * distinct_id (set server-side, since posthog-node takes it per-call) so the
 * lead_captured -> invoice_paid funnel connects across both client- and server-originated
 * events for the same lead. `login` is the one user-lifecycle event and uses the profile id
 * instead (see src/lib/analytics.ts identifyStaff).
 */
export const LEAD_LIFECYCLE_EVENTS = [
  'lead_captured',
  'ack_sent',
  'quote_sent',
  'quote_accepted',
  'booking_created',
  'job_completed',
  'invoice_sent',
  'invoice_paid',
  'review_sent',
  'offline_queue_flush_failed',
  'extraction_fallback_used',
] as const satisfies readonly AnalyticsEvent[]

/**
 * Lead-lifecycle events that can only originate client-side (a direct browser Supabase write,
 * no natural server round-trip to hook instead). These relay through
 * POST /api/leads?action=analytics-track so they get distinctId=leadId server-side, same as
 * every other lead-lifecycle event — see api/leads.ts.
 */
export const CLIENT_RELAYED_EVENTS = [
  'lead_captured',
  'booking_created',
  'job_completed',
  'offline_queue_flush_failed',
] as const satisfies readonly AnalyticsEvent[]

export type ClientRelayedEvent = (typeof CLIENT_RELAYED_EVENTS)[number]

/**
 * Keys that must never appear in an analytics payload, regardless of what the type system
 * allows a caller to construct (defense-in-depth against `as any` casts). Belt-and-suspenders
 * on top of AnalyticsEventProperties' compile-time shape.
 */
const FORBIDDEN_PROPERTY_KEYS = [
  'name',
  'customername',
  'firstname',
  'lastname',
  'phone',
  'mobile',
  'email',
  'address',
  'street',
  'suburb',
  'postcode',
  'photo',
  'photourl',
  'notes',
  'note',
  'signature',
  'message',
]

/**
 * Throws if any property key (case-insensitive) matches the PII banlist. Call before every
 * capture on both the client and server analytics modules.
 */
export function assertNoForbiddenKeys(properties: Record<string, unknown>): void {
  for (const key of Object.keys(properties)) {
    if (FORBIDDEN_PROPERTY_KEYS.includes(key.toLowerCase())) {
      throw new Error(`Analytics property "${key}" is on the PII banlist and must not be sent`)
    }
  }
}
