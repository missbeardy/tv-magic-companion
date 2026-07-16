import type { Org } from '../types/org'
import { isPlatformFeaturesEnabled } from './env'
import {
  FEATURE_SWITCH_CATEGORIES,
  FEATURE_SWITCH_CATEGORY_BY_KEY,
  FEATURE_SWITCH_CATEGORY_LABELS,
  FEATURE_SWITCH_KEYS,
  FEATURE_SWITCH_MIN_TIERS,
  FEATURE_SWITCHES_BY_CATEGORY,
  type FeatureSwitchCategory,
  type FeatureSwitchKey,
} from '../../shared/featureSwitchCatalog'

export {
  FEATURE_SWITCH_CATEGORIES,
  FEATURE_SWITCH_CATEGORY_BY_KEY,
  FEATURE_SWITCH_CATEGORY_LABELS,
  FEATURE_SWITCH_KEYS,
  FEATURE_SWITCH_MIN_TIERS,
  FEATURE_SWITCHES_BY_CATEGORY,
  type FeatureSwitchCategory,
  type FeatureSwitchKey,
}

export const FEATURES = {
  leads: { tier: 'basic', nav: '/leads', label: 'Leads' },
  calendar: { tier: 'basic', nav: '/calendar', label: 'Calendar' },
  tasks: { tier: 'pro', nav: '/tasks', label: 'Tasks' },
  social: { tier: 'pro', nav: '/social', label: 'Social' },
  ai_parsing: { tier: 'pro', nav: null, label: 'AI Lead Parsing' },
  task_board: { tier: 'pro', nav: '/tasks', label: 'Task Board' },
  reports: { tier: 'pro', nav: '/reports', label: 'Reports' },
  api_access: { tier: 'enterprise', nav: null, label: 'API Access' },
} as const

export const FEATURE_SWITCH_DEFAULTS: Record<FeatureSwitchKey, boolean> = {
  smart_assign_badge: false,
  inbound_auto_assign: false,
  quote_esign: false,
  review_requests: false,
  customer_ontheway_sms: false,
  booking_confirm: true,
  manager_new_lead_alerts: false,
  inbound_sms: false,
  inbound_email: false,
  inbound_calls: false,
  inbound_messenger: false,
  missed_call_hookback_sms: false,
  lead_ack_sms: false,
  lead_ack_email: false,
  completion_upsells: false,
  one_tap_invoice: false,
  invoice_chase: false,
  quote_chase: false,
  price_list: false,
  invoice_card_payments: false,
  accounting_export: false,
  tech_location: false,
  internal_messaging: false,
  customer_linking: false,
  customer_profiles: false,
}

export const FEATURE_SWITCH_DEFINITIONS: Record<
  FeatureSwitchKey,
  { label: string; description: string }
> = {
  smart_assign_badge: {
    label: 'Smart Assign Badge',
    description: 'Assign modal recommendation badges and highlighting',
  },
  inbound_auto_assign: {
    label: 'Inbound Auto-Assign',
    description: 'Automatically assign inbound team leads to the best available technician',
  },
  quote_esign: {
    label: 'Quote Acceptance + E-Sign',
    description: 'Send quotes and capture customer acceptance signatures',
  },
  review_requests: {
    label: 'Google Review Request SMS',
    description: 'Post-job review link SMS to customers',
  },
  customer_ontheway_sms: {
    label: 'Customer On The Way SMS',
    description: 'ETA SMS button opens the technician\'s phone with a branded message',
  },
  booking_confirm: {
    label: 'Customer Booking Confirmation',
    description: 'SMS + email with .ics calendar invite sent to the customer when a job is booked',
  },
  manager_new_lead_alerts: {
    label: 'Manager New-Lead Alert SMS',
    description: 'SMS to managers when a new unassigned lead arrives',
  },
  inbound_sms: {
    label: 'Inbound SMS Leads',
    description: 'Create leads from inbound Twilio SMS webhooks',
  },
  inbound_email: {
    label: 'Inbound Email Leads',
    description: 'Create leads from inbound email webhooks',
  },
  inbound_calls: {
    label: 'Inbound Calls / Voicemail',
    description: 'Create leads from missed calls and voicemail',
  },
  inbound_messenger: {
    label: 'Inbound Meta Messaging',
    description: 'Create leads from Facebook Messenger and Instagram DM webhooks',
  },
  missed_call_hookback_sms: {
    label: 'Missed Call Auto-Reply SMS',
    description: 'Instant branded SMS to callers when a voicemail lead is created (Cloudmailin path)',
  },
  lead_ack_sms: {
    label: 'Lead Acknowledgement SMS',
    description: 'Instant branded thank-you SMS to customers when a new inbound lead is created',
  },
  lead_ack_email: {
    label: 'Lead Acknowledgement Email',
    description: 'Instant branded thank-you email when a new inbound lead has no phone number',
  },
  completion_upsells: {
    label: 'Completion Upsell Checklist',
    description: 'Upsell prompts in the job completion flow',
  },
  one_tap_invoice: {
    label: 'One-Tap Invoice Email',
    description: 'Send branded invoice emails at job completion with optional PDF attachment',
  },
  invoice_chase: {
    label: 'Overdue Invoice Chase',
    description: 'Automated SMS/email reminders for overdue sent invoices',
  },
  quote_chase: {
    label: 'Quote Follow-Up Chase',
    description: 'Automated SMS/email nudges for sent quotes awaiting customer response',
  },
  price_list: {
    label: 'Price List / Favourites',
    description: 'Quick-add chips for 10-20 common priced jobs when composing quotes and invoices',
  },
  invoice_card_payments: {
    label: 'Card / Pay Now on Invoice',
    description: 'Adds a Pay Now button to invoice emails; customer pays by card via the org\'s connected Stripe account',
  },
  accounting_export: {
    label: 'Accounting CSV Export',
    description: 'Export invoices as a Xero-compatible sales invoice CSV (Tax Inclusive)',
  },
  tech_location: {
    label: 'Tech Location Tracking',
    description: 'Periodic GPS updates from employee devices',
  },
  internal_messaging: {
    label: 'Internal Support Messaging',
    description: 'In-app 1:1 messaging with support plus a read-only announcements feed',
  },
  customer_linking: {
    label: 'Customer Linking',
    description: 'Match or create a customer record for each inbound lead',
  },
  customer_profiles: {
    label: 'Customer Profiles',
    description: 'Show a read-only history of a customer\'s previous jobs in the lead detail sheet',
  },
}

export type FeatureKey = keyof typeof FEATURES

const TIER_ORDER = ['basic', 'pro', 'enterprise'] as const

type Tier = Org['subscription_tier']

export function tierIncludes(tier: Tier, required: Tier): boolean {
  const userIdx = TIER_ORDER.indexOf(tier)
  const reqIdx = TIER_ORDER.indexOf(required)
  if (userIdx === -1 || reqIdx === -1) return false
  return userIdx >= reqIdx
}

/** When platform features are off (production cutover), show everything. */
export function canAccessFeature(
  feature: FeatureKey,
  tier: Tier | undefined
): boolean {
  if (!isPlatformFeaturesEnabled()) return true
  const effectiveTier = tier ?? 'basic'
  const def = FEATURES[feature]
  if (!def) return false
  return tierIncludes(effectiveTier, def.tier)
}

export type FeatureSwitchState = Record<FeatureSwitchKey, boolean>

export function getDefaultFeatureSwitchState(): FeatureSwitchState {
  return { ...FEATURE_SWITCH_DEFAULTS }
}

export function canAccessFeatureSwitch(
  feature: FeatureSwitchKey,
  tier: Tier | undefined,
  switches: Partial<FeatureSwitchState> | undefined
): boolean {
  const effectiveTier = tier ?? 'basic'
  const requiredTier = FEATURE_SWITCH_MIN_TIERS[feature]
  if (!tierIncludes(effectiveTier, requiredTier)) return false
  return Boolean(switches?.[feature] ?? FEATURE_SWITCH_DEFAULTS[feature])
}

/** Alias for manual rollout switches: tier gate + brand ON. */
export function canUseFeature(
  feature: FeatureSwitchKey,
  tier: Tier | undefined,
  switches: Partial<FeatureSwitchState> | undefined
): boolean {
  return canAccessFeatureSwitch(feature, tier, switches)
}

export function resolveFeatureSwitchValue(
  feature: FeatureSwitchKey,
  values: {
    catalogDefault?: boolean | null
    brandValue?: boolean | null
  }
): boolean {
  if (values.brandValue === true || values.brandValue === false) return values.brandValue
  if (values.catalogDefault === true || values.catalogDefault === false) return values.catalogDefault
  return FEATURE_SWITCH_DEFAULTS[feature]
}
