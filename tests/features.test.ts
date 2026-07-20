import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  canAccessFeature,
  canAccessFeatureSwitch,
  canUseFeature,
  getDefaultFeatureSwitchState,
} from '../src/lib/features'

describe('canAccessFeature', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ENABLE_PLATFORM_FEATURES', 'true')
  })

  it('allows basic features on basic tier', () => {
    expect(canAccessFeature('leads', 'basic')).toBe(true)
    expect(canAccessFeature('calendar', 'basic')).toBe(true)
  })

  it('blocks pro features on basic tier', () => {
    expect(canAccessFeature('social', 'basic')).toBe(false)
    expect(canAccessFeature('ai_parsing', 'basic')).toBe(false)
    expect(canAccessFeature('reports', 'basic')).toBe(false)
  })

  it('allows pro features on pro tier', () => {
    expect(canAccessFeature('social', 'pro')).toBe(true)
    expect(canAccessFeature('ai_parsing', 'pro')).toBe(true)
    expect(canAccessFeature('reports', 'pro')).toBe(true)
  })

  it('shows all features when platform flag is off', async () => {
    vi.stubEnv('VITE_ENABLE_PLATFORM_FEATURES', 'false')
    vi.resetModules()
    const { canAccessFeature: check } = await import('../src/lib/features')
    expect(check('social', 'basic')).toBe(true)
  })
})

describe('canAccessFeatureSwitch', () => {
  it('is off by default for all switches', () => {
    const defaults = getDefaultFeatureSwitchState()
    expect(canAccessFeatureSwitch('smart_assign_badge', 'basic', defaults)).toBe(false)
    expect(canAccessFeatureSwitch('quote_esign', 'pro', defaults)).toBe(false)
    expect(canAccessFeatureSwitch('review_requests', 'basic', defaults)).toBe(false)
  })

  it('requires switch on and sufficient tier', () => {
    const switches = { ...getDefaultFeatureSwitchState(), quote_esign: true }
    expect(canAccessFeatureSwitch('quote_esign', 'pro', switches)).toBe(true)
    expect(canAccessFeatureSwitch('quote_esign', 'basic', switches)).toBe(false)
  })

  it('canUseFeature matches canAccessFeatureSwitch', () => {
    const switches = { ...getDefaultFeatureSwitchState(), inbound_sms: true }
    expect(canUseFeature('inbound_sms', 'basic', switches)).toBe(true)
    expect(canUseFeature('inbound_sms', 'basic', getDefaultFeatureSwitchState())).toBe(false)
  })
})
