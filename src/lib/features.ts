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

export const FEATURE_SWITCH_KEYS = ['smart_assign_badge', 'quote_esign'] as const
export type FeatureSwitchKey = (typeof FEATURE_SWITCH_KEYS)[number]

export const FEATURE_SWITCH_DEFAULTS: Record<FeatureSwitchKey, boolean> = {
  smart_assign_badge: false,
  quote_esign: false,
}

export const FEATURE_SWITCH_DEFINITIONS: Record<
  FeatureSwitchKey,
  { label: string; description: string }
> = {
  smart_assign_badge: {
    label: 'Smart Assign Badge',
    description: 'Assign modal recommendation badges and highlighting',
  },
  quote_esign: {
    label: 'Quote Acceptance + E-Sign',
    description: 'Send quotes and capture customer acceptance signatures',
  },
}

const FEATURE_SWITCH_TIERS: Record<FeatureSwitchKey, Org['subscription_tier']> = {
  smart_assign_badge: 'basic',
  quote_esign: 'pro',
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
  const requiredTier = FEATURE_SWITCH_TIERS[feature]
  if (!tierIncludes(effectiveTier, requiredTier)) return false
  return Boolean(switches?.[feature] ?? FEATURE_SWITCH_DEFAULTS[feature])
}

export function resolveFeatureSwitchValue(
  feature: FeatureSwitchKey,
  values: {
    catalogDefault?: boolean | null
    brandValue?: boolean | null
    orgOverride?: boolean | null
  }
): boolean {
  if (values.orgOverride === true || values.orgOverride === false) return values.orgOverride
  if (values.brandValue === true || values.brandValue === false) return values.brandValue
  if (values.catalogDefault === true || values.catalogDefault === false) return values.catalogDefault
  return FEATURE_SWITCH_DEFAULTS[feature]
}
