import type { Org } from '../types/org'
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

export const FEATURE_SWITCH_DEFAULTS: Record<FeatureSwitchKey, boolean> = {
  smart_assign_badge: false,
  inbound_auto_assign: false,
  assignment_exclusions: false,
  quote_esign: false,
  review_requests: false,
  auto_review_on_paid: false,
  customer_ontheway_sms: false,
  two_way_sms: false,
  booking_confirm: true,
  booking_reminder_sms: false,
  manager_new_lead_alerts: false,
  inbound_sms: false,
  inbound_email: false,
  inbound_calls: false,
  inbound_messenger: false,
  inbound_facebook_ads: false,
  campaign_quote: false,
  native_web_push: false,
  lead_ack_sms: false,
  completion_upsells: false,
  one_tap_invoice: false,
  invoice_card_payments: false,
  accounting_export: false,
  tech_location: false,
  customer_linking: false,
  customer_profiles: false,
  onboarding_tips: true,
  weekly_leaderboard_nudge: false,
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
  assignment_exclusions: {
    label: 'Technician Job Exclusions',
    description:
      'Skip technicians flagged as unable to do a job type when auto-assigning, and warn on manual assign',
  },
  quote_esign: {
    label: 'Quote Acceptance + E-Sign',
    description: 'Send quotes and capture customer acceptance signatures',
  },
  review_requests: {
    label: 'Google Review Request SMS',
    description: 'Post-job review link SMS to customers',
  },
  auto_review_on_paid: {
    label: 'Auto Review Request on Paid',
    description:
      'When an invoice is marked paid (card or manual), automatically SMS the Google review link if review requests are enabled and one has not already been sent',
  },
  customer_ontheway_sms: {
    label: 'Customer On The Way SMS',
    description: 'ETA SMS button opens the technician\'s phone with a branded message',
  },
  two_way_sms: {
    label: 'In-App Two-Way SMS',
    description: 'Send and receive customer SMS from the lead sheet instead of the device SMS app',
  },
  booking_confirm: {
    label: 'Customer Booking Confirmation',
    description: 'SMS + email with .ics calendar invite sent to the customer when a job is booked',
  },
  booking_reminder_sms: {
    label: 'Day-Before Booking Reminder',
    description: 'Automatic SMS reminder sent to the customer roughly 24 hours before a booked appointment',
  },
  manager_new_lead_alerts: {
    label: 'Manager New-Lead Alert SMS',
    description: 'SMS to managers when a new unassigned lead arrives',
  },
  inbound_sms: {
    label: 'Inbound SMS Leads',
    description: 'Create leads from inbound SMS webhooks (Twilio or Mobile Message)',
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
  inbound_facebook_ads: {
    label: 'Facebook Lead Ads',
    description: 'Create leads from Facebook Lead Ads instant forms (via Make.com)',
  },
  campaign_quote: {
    label: 'Campaign Quote / Wall Visualiser',
    description: 'Public /visualise/:orgSlug wall visualiser and quote form for this org',
  },
  native_web_push: {
    label: 'Native Web Push',
    description: 'Deliver push notifications directly from the app via Web Push (VAPID) instead of relaying through OneSignal',
  },
  lead_ack_sms: {
    label: 'Lead Acknowledgement SMS',
    description: 'Instant branded thank-you SMS to customers when a new inbound lead is created',
  },
  completion_upsells: {
    label: 'Completion Upsell Checklist',
    description: 'Upsell prompts in the job completion flow',
  },
  one_tap_invoice: {
    label: 'One-Tap Invoice Email',
    description: 'Send branded invoice emails at job completion with optional PDF attachment',
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
  customer_linking: {
    label: 'Customer Linking',
    description: 'Match or create a customer record for each inbound lead',
  },
  customer_profiles: {
    label: 'Customer Profiles',
    description: 'Show previous-jobs history on the lead detail sheet for linked customers',
  },
  onboarding_tips: {
    label: 'In-App Onboarding Tips',
    description: 'Coach tips for pool timer, contact rounds, and next-action CTAs (team mode)',
  },
  weekly_leaderboard_nudge: {
    label: 'Weekly Leaderboard Nudge',
    description: 'Friday reminder to the manager to post results, then a notification to the team when the week is in',
  },
}

const TIER_ORDER = ['basic', 'pro', 'enterprise'] as const

type Tier = Org['subscription_tier']

export function tierIncludes(tier: Tier, required: Tier): boolean {
  const userIdx = TIER_ORDER.indexOf(tier)
  const reqIdx = TIER_ORDER.indexOf(required)
  if (userIdx === -1 || reqIdx === -1) return false
  return userIdx >= reqIdx
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
    orgValue?: boolean | null
  }
): boolean {
  if (values.orgValue === true || values.orgValue === false) return values.orgValue
  if (values.brandValue === true || values.brandValue === false) return values.brandValue
  if (values.catalogDefault === true || values.catalogDefault === false) return values.catalogDefault
  return FEATURE_SWITCH_DEFAULTS[feature]
}
