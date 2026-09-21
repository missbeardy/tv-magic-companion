/** Server-safe feature switch catalog — no Vite/env imports. Shared by api/ and src/. */

export type SubscriptionTier = 'basic' | 'pro' | 'enterprise'

export const FEATURE_SWITCH_KEYS = [
  'smart_assign_badge',
  'inbound_auto_assign',
  'assignment_exclusions',
  'quote_esign',
  'review_requests',
  'auto_review_on_paid',
  'customer_ontheway_sms',
  'two_way_sms',
  'booking_confirm',
  'booking_reminder_sms',
  'manager_new_lead_alerts',
  'inbound_sms',
  'inbound_email',
  'inbound_calls',
  'inbound_messenger',
  'inbound_facebook_ads',
  'lead_ack_sms',
  'completion_upsells',
  'one_tap_invoice',
  'invoice_card_payments',
  'accounting_export',
  'tech_location',
  'customer_linking',
  'customer_profiles',
  'onboarding_tips',
  'native_web_push',
  'weekly_leaderboard_nudge',
] as const

export type FeatureSwitchKey = (typeof FEATURE_SWITCH_KEYS)[number]

export const FEATURE_SWITCH_CATEGORIES = [
  'lead_intake',
  'customer_communication',
  'team_operations',
  'sales_job_completion',
] as const

export type FeatureSwitchCategory = (typeof FEATURE_SWITCH_CATEGORIES)[number]

export const FEATURE_SWITCH_CATEGORY_LABELS: Record<FeatureSwitchCategory, string> = {
  lead_intake: 'Lead Intake',
  customer_communication: 'Customer Communication',
  team_operations: 'Team Operations',
  sales_job_completion: 'Sales & Job Completion',
}

export const FEATURE_SWITCHES_BY_CATEGORY: Record<FeatureSwitchCategory, readonly FeatureSwitchKey[]> = {
  lead_intake: ['inbound_sms', 'inbound_email', 'inbound_calls', 'inbound_messenger', 'inbound_facebook_ads', 'customer_linking'],
  customer_communication: ['lead_ack_sms', 'customer_ontheway_sms', 'two_way_sms', 'booking_confirm', 'booking_reminder_sms', 'review_requests', 'auto_review_on_paid'],
  team_operations: ['manager_new_lead_alerts', 'smart_assign_badge', 'inbound_auto_assign', 'assignment_exclusions', 'tech_location', 'customer_profiles', 'onboarding_tips', 'native_web_push', 'weekly_leaderboard_nudge'],
  sales_job_completion: ['quote_esign', 'completion_upsells', 'one_tap_invoice', 'invoice_card_payments', 'accounting_export'],
}

export const FEATURE_SWITCH_CATEGORY_BY_KEY: Record<FeatureSwitchKey, FeatureSwitchCategory> = {
  inbound_sms: 'lead_intake',
  inbound_email: 'lead_intake',
  inbound_calls: 'lead_intake',
  inbound_messenger: 'lead_intake',
  inbound_facebook_ads: 'lead_intake',
  customer_linking: 'lead_intake',
  lead_ack_sms: 'customer_communication',
  customer_ontheway_sms: 'customer_communication',
  two_way_sms: 'customer_communication',
  booking_confirm: 'customer_communication',
  booking_reminder_sms: 'customer_communication',
  review_requests: 'customer_communication',
  auto_review_on_paid: 'customer_communication',
  manager_new_lead_alerts: 'team_operations',
  smart_assign_badge: 'team_operations',
  inbound_auto_assign: 'team_operations',
  assignment_exclusions: 'team_operations',
  tech_location: 'team_operations',
  customer_profiles: 'team_operations',
  onboarding_tips: 'team_operations',
  native_web_push: 'team_operations',
  weekly_leaderboard_nudge: 'team_operations',
  quote_esign: 'sales_job_completion',
  completion_upsells: 'sales_job_completion',
  one_tap_invoice: 'sales_job_completion',
  invoice_card_payments: 'sales_job_completion',
  accounting_export: 'sales_job_completion',
}

export const FEATURE_SWITCH_MIN_TIERS: Record<FeatureSwitchKey, SubscriptionTier> =
  Object.fromEntries(FEATURE_SWITCH_KEYS.map((key) => [key, 'basic'])) as Record<
    FeatureSwitchKey,
    SubscriptionTier
  >
