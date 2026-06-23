export type SubscriptionTier = 'basic' | 'pro' | 'enterprise'

export type FeatureKey =
  | 'leads'
  | 'calendar'
  | 'tasks'
  | 'social'
  | 'ai_parsing'
  | 'task_board'
  | 'reports'
  | 'api_access'

const FEATURE_TIERS: Record<FeatureKey, SubscriptionTier> = {
  leads: 'basic',
  calendar: 'basic',
  tasks: 'pro',
  social: 'pro',
  ai_parsing: 'pro',
  task_board: 'pro',
  reports: 'pro',
  api_access: 'enterprise',
}

const TIER_ORDER: SubscriptionTier[] = ['basic', 'pro', 'enterprise']

export function isPlatformFeaturesEnabled(): boolean {
  return (
    process.env.ENABLE_PLATFORM_FEATURES === 'true' ||
    process.env.VITE_ENABLE_PLATFORM_FEATURES === 'true'
  )
}

function tierIncludes(userTier: SubscriptionTier, required: SubscriptionTier): boolean {
  const userIdx = TIER_ORDER.indexOf(userTier)
  const reqIdx = TIER_ORDER.indexOf(required)
  if (userIdx === -1 || reqIdx === -1) return false
  return userIdx >= reqIdx
}

export function canAccessFeature(
  feature: FeatureKey,
  tier: SubscriptionTier | undefined
): boolean {
  if (!isPlatformFeaturesEnabled()) return true
  if (!tier) return false
  const required = FEATURE_TIERS[feature]
  if (!required) return false
  return tierIncludes(tier, required)
}

export function tierFromStripePriceId(priceId: string): SubscriptionTier | null {
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return 'enterprise'
  if (priceId === process.env.STRIPE_PRICE_BASIC) return 'basic'
  return null
}
