import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { canAccessFeature, tierFromStripePriceId } from '../api/_lib/tier'
import { buildBrandTransferPayload } from '../src/lib/brandTransfer'

describe('api tier enforcement', () => {
  const originalEnv = process.env.ENABLE_PLATFORM_FEATURES

  beforeEach(() => {
    process.env.ENABLE_PLATFORM_FEATURES = 'true'
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_PLATFORM_FEATURES
    } else {
      process.env.ENABLE_PLATFORM_FEATURES = originalEnv
    }
  })

  it('blocks ai_parsing on basic tier', () => {
    expect(canAccessFeature('ai_parsing', 'basic')).toBe(false)
    expect(canAccessFeature('ai_parsing', 'pro')).toBe(true)
  })

  it('blocks social on basic tier', () => {
    expect(canAccessFeature('social', 'basic')).toBe(false)
    expect(canAccessFeature('social', 'pro')).toBe(true)
  })

  it('allows leads on all tiers when platform features enabled', () => {
    expect(canAccessFeature('leads', 'basic')).toBe(true)
    expect(canAccessFeature('leads', 'pro')).toBe(true)
  })

  it('maps stripe price ids to tiers', () => {
    process.env.STRIPE_PRICE_PRO = 'price_pro_test'
    expect(tierFromStripePriceId('price_pro_test')).toBe('pro')
    expect(tierFromStripePriceId('unknown')).toBeNull()
    delete process.env.STRIPE_PRICE_PRO
  })
})

describe('brand transfer', () => {
  it('copies brand colors and upsells onto org payload', () => {
    const payload = buildBrandTransferPayload({
      id: 'brand-1',
      primary_color: '#111111',
      secondary_color: '#222222',
      upsell_items: [{ id: '1', label: 'Check signal' }],
    })
    expect(payload.brand_id).toBe('brand-1')
    expect(payload.primary_color).toBe('#111111')
    expect(payload.upsell_items).toHaveLength(1)
  })
})
