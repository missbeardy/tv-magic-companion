import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canAccessFeature } from '../src/lib/features'

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
  })

  it('allows pro features on pro tier', () => {
    expect(canAccessFeature('social', 'pro')).toBe(true)
    expect(canAccessFeature('tasks', 'pro')).toBe(true)
  })

  it('shows all features when platform flag is off', async () => {
    vi.stubEnv('VITE_ENABLE_PLATFORM_FEATURES', 'false')
    vi.resetModules()
    const { canAccessFeature: check } = await import('../src/lib/features')
    expect(check('social', 'basic')).toBe(true)
  })
})
