/** Server-safe feature switch catalog — no Vite/env imports. Shared with src/lib/features.ts. */

export type SubscriptionTier = 'basic' | 'pro' | 'enterprise'

export const FEATURE_SWITCH_KEYS = [
  'smart_assign_badge',
  'quote_esign',
  'review_requests',
  'customer_ontheway_sms',
  'manager_new_lead_alerts',
  'inbound_sms',
  'inbound_email',
  'inbound_calls',
  'missed_call_hookback_sms',
  'completion_upsells',
  'tech_location',
] as const

export type FeatureSwitchKey = (typeof FEATURE_SWITCH_KEYS)[number]

export const FEATURE_SWITCH_MIN_TIERS: Record<FeatureSwitchKey, SubscriptionTier> = {
  smart_assign_badge: 'basic',
  quote_esign: 'pro',
  review_requests: 'basic',
  customer_ontheway_sms: 'basic',
  manager_new_lead_alerts: 'basic',
  inbound_sms: 'basic',
  inbound_email: 'basic',
  inbound_calls: 'basic',
  missed_call_hookback_sms: 'basic',
  completion_upsells: 'basic',
  tech_location: 'basic',
}
