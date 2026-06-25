import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canAccessFeature, canAccessFeatureSwitch, getDefaultFeatureSwitchState } from '../src/lib/features'

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
    expect(canAccessFeature('tasks', 'basic')).toBe(false)
    expect(canAccessFeature('reports', 'basic')).toBe(false)
  })

  it('allows pro features on pro tier', () => {
    expect(canAccessFeature('social', 'pro')).toBe(true)
    expect(canAccessFeature('tasks', 'pro')).toBe(true)
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
  it('is off by default', () => {
    const defaults = getDefaultFeatureSwitchState()
    expect(canAccessFeatureSwitch('smart_assign_badge', 'basic', defaults)).toBe(false)
    expect(canAccessFeatureSwitch('quote_esign', 'pro', defaults)).toBe(false)
  })

  it('requires switch on and sufficient tier', () => {
    expect(
      canAccessFeatureSwitch('quote_esign', 'pro', {
        smart_assign_badge: false,
        quote_esign: true,
      })
    ).toBe(true)
    expect(
      canAccessFeatureSwitch('quote_esign', 'basic', {
        smart_assign_badge: false,
        quote_esign: true,
      })
    ).toBe(false)
  })
})
