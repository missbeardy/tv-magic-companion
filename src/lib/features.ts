import type { Org } from '../context/OrgContext'
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

export type FeatureKey = keyof typeof FEATURES

const TIER_ORDER = ['basic', 'pro', 'enterprise'] as const

function tierIncludes(tier: Org['subscription_tier'], required: string): boolean {
  const userIdx = TIER_ORDER.indexOf(tier)
  const reqIdx = TIER_ORDER.indexOf(required as (typeof TIER_ORDER)[number])
  if (userIdx === -1 || reqIdx === -1) return false
  return userIdx >= reqIdx
}

/** When platform features are off (production cutover), show everything. */
export function canAccessFeature(
  feature: FeatureKey,
  tier: Org['subscription_tier'] | undefined
): boolean {
  if (!isPlatformFeaturesEnabled()) return true
  const effectiveTier = tier ?? 'basic'
  const def = FEATURES[feature]
  if (!def) return false
  return tierIncludes(effectiveTier, def.tier)
}
