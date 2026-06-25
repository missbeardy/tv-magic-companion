import type { Org } from '../types/org'
import { isPlatformFeaturesEnabled } from './env'

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

export const FEATURE_SWITCH_DEFAULTS: Record<FeatureSwitchKey, boolean> = {
  smart_assign_badge: false,
  quote_esign: false,
  review_requests: false,
  customer_ontheway_sms: false,
  manager_new_lead_alerts: false,
  inbound_sms: false,
  inbound_email: false,
  inbound_calls: false,
  missed_call_hookback_sms: false,
  completion_upsells: false,
  tech_location: false,
}

export const FEATURE_SWITCH_DEFINITIONS: Record<
  FeatureSwitchKey,
  { label: string; description: string }
> = {
  smart_assign_badge: {
    label: 'Smart Assign',
    description: 'Assign modal recommendation badges and highlighting',
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
    description: 'ETA SMS with maps link when tech is en route',
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
  missed_call_hookback_sms: {
    label: 'Missed Call Auto-Reply SMS',
    description: 'Instant branded SMS to callers when a call is missed',
  },
  completion_upsells: {
    label: 'Completion Upsell Checklist',
    description: 'Upsell prompts in the job completion flow',
  },
  tech_location: {
    label: 'Tech Location Tracking',
    description: 'Periodic GPS updates from employee devices',
  },
}

export const FEATURE_SWITCH_MIN_TIERS: Record<FeatureSwitchKey, Org['subscription_tier']> = {
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
