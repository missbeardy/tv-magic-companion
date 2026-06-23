import Stripe from 'stripe'
import { getPlatformUrl } from './platformUrl.js'

export { getPlatformUrl }

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key)
}

export function getPriceIdForTier(tier: 'pro' | 'enterprise'): string | null {
  const raw =
    tier === 'pro'
      ? process.env.STRIPE_PRICE_PRO
      : tier === 'enterprise'
        ? process.env.STRIPE_PRICE_ENTERPRISE
        : null
  if (!raw?.trim()) return null
  return raw.trim()
}

/** Stripe Checkout needs a Price ID (price_…), not a Product ID (prod_…). */
export function validatePriceId(priceId: string, envName: string): string | null {
  if (priceId.startsWith('prod_')) {
    return `${envName} is a Product ID (${priceId}). Use the Price ID (price_…) from Stripe → Products → your product → Pricing.`
  }
  if (!priceId.startsWith('price_')) {
    return `${envName} must start with price_ (got ${priceId.slice(0, 12)}…).`
  }
  return null
}
