export type SubscriptionTier = 'basic' | 'pro' | 'enterprise'

const TIER_ORDER: SubscriptionTier[] = ['basic', 'pro', 'enterprise']

export function isPlatformFeaturesEnabled(): boolean {
  return (
    process.env.ENABLE_PLATFORM_FEATURES === 'true' ||
    process.env.VITE_ENABLE_PLATFORM_FEATURES === 'true'
  )
}

export function tierIncludes(userTier: SubscriptionTier, required: SubscriptionTier): boolean {
  const userIdx = TIER_ORDER.indexOf(userTier)
  const reqIdx = TIER_ORDER.indexOf(required)
  if (userIdx === -1 || reqIdx === -1) return false
  return userIdx >= reqIdx
}

export function tierFromStripePriceId(priceId: string): SubscriptionTier | null {
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return 'enterprise'
  if (priceId === process.env.STRIPE_PRICE_BASIC) return 'basic'
  return null
}
