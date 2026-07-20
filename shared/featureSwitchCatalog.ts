/** Server-safe feature switch catalog — no Vite/env imports. Shared by api/ and src/. */

export type SubscriptionTier = 'basic' | 'pro' | 'enterprise'

export const FEATURE_SWITCH_KEYS = [
  'smart_assign_badge',
  'inbound_auto_assign',
  'quote_esign',
  'review_requests',
  'auto_review_on_paid',
  'customer_ontheway_sms',
  'booking_confirm',
  'booking_reminder_sms',
  'manager_new_lead_alerts',
  'inbound_sms',
  'inbound_email',
  'inbound_calls',
  'inbound_messenger',
  'missed_call_hookback_sms',
  'lead_ack_sms',
  'lead_ack_email',
  'completion_upsells',
  'one_tap_invoice',
  'invoice_chase',
  'quote_chase',
  'price_list',
  'invoice_card_payments',
  'accounting_export',
  'tech_location',
  'internal_messaging',
  'customer_linking',
  'customer_profiles',
  'customer_import',
  'onboarding_tips',
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
  lead_intake: ['inbound_sms', 'inbound_email', 'inbound_calls', 'inbound_messenger', 'customer_linking', 'customer_import'],
  customer_communication: ['missed_call_hookback_sms', 'lead_ack_sms', 'lead_ack_email', 'customer_ontheway_sms', 'booking_confirm', 'booking_reminder_sms', 'review_requests', 'auto_review_on_paid'],
  team_operations: ['manager_new_lead_alerts', 'smart_assign_badge', 'inbound_auto_assign', 'tech_location', 'internal_messaging', 'customer_profiles', 'onboarding_tips'],
  sales_job_completion: ['quote_esign', 'completion_upsells', 'one_tap_invoice', 'invoice_chase', 'quote_chase', 'price_list', 'invoice_card_payments', 'accounting_export'],
}

export const FEATURE_SWITCH_CATEGORY_BY_KEY: Record<FeatureSwitchKey, FeatureSwitchCategory> = {
  inbound_sms: 'lead_intake',
  inbound_email: 'lead_intake',
  inbound_calls: 'lead_intake',
  inbound_messenger: 'lead_intake',
  customer_linking: 'lead_intake',
  customer_import: 'lead_intake',
  missed_call_hookback_sms: 'customer_communication',
  lead_ack_sms: 'customer_communication',
  lead_ack_email: 'customer_communication',
  customer_ontheway_sms: 'customer_communication',
  booking_confirm: 'customer_communication',
  booking_reminder_sms: 'customer_communication',
  review_requests: 'customer_communication',
  auto_review_on_paid: 'customer_communication',
  manager_new_lead_alerts: 'team_operations',
  smart_assign_badge: 'team_operations',
  inbound_auto_assign: 'team_operations',
  tech_location: 'team_operations',
  internal_messaging: 'team_operations',
  customer_profiles: 'team_operations',
  onboarding_tips: 'team_operations',
  quote_esign: 'sales_job_completion',
  completion_upsells: 'sales_job_completion',
  one_tap_invoice: 'sales_job_completion',
  invoice_chase: 'sales_job_completion',
  quote_chase: 'sales_job_completion',
  price_list: 'sales_job_completion',
  invoice_card_payments: 'sales_job_completion',
  accounting_export: 'sales_job_completion',
}

export const FEATURE_SWITCH_MIN_TIERS: Record<FeatureSwitchKey, SubscriptionTier> = {
  smart_assign_badge: 'basic',
  inbound_auto_assign: 'basic',
  quote_esign: 'pro',
  review_requests: 'basic',
  auto_review_on_paid: 'basic',
  customer_ontheway_sms: 'basic',
  booking_confirm: 'basic',
  booking_reminder_sms: 'basic',
  manager_new_lead_alerts: 'basic',
  inbound_sms: 'basic',
  inbound_email: 'basic',
  inbound_calls: 'basic',
  inbound_messenger: 'basic',
  missed_call_hookback_sms: 'basic',
  lead_ack_sms: 'basic',
  lead_ack_email: 'basic',
  completion_upsells: 'basic',
  one_tap_invoice: 'pro',
  invoice_chase: 'pro',
  quote_chase: 'pro',
  price_list: 'basic',
  invoice_card_payments: 'pro',
  accounting_export: 'basic',
  tech_location: 'basic',
  internal_messaging: 'basic',
  customer_linking: 'basic',
  customer_profiles: 'basic',
  customer_import: 'basic',
  onboarding_tips: 'basic',
}
