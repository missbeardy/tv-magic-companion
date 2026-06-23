import Stripe from 'stripe'
import { getPlatformUrl } from './platformUrl.js'

export { getPlatformUrl }

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key)
}

export function getPriceIdForTier(tier: 'pro' | 'enterprise'): string | null {
  if (tier === 'pro') return process.env.STRIPE_PRICE_PRO ?? null
  if (tier === 'enterprise') return process.env.STRIPE_PRICE_ENTERPRISE ?? null
  return null
}
