import { describe, it, expect } from 'vitest'
import {
  canAccessFeatureSwitch,
  canUseFeature,
  getDefaultFeatureSwitchState,
  resolveFeatureSwitchValue,
} from '../src/lib/features'

describe('canAccessFeatureSwitch', () => {
  it('is off by default for all switches', () => {
    const defaults = getDefaultFeatureSwitchState()
    expect(canAccessFeatureSwitch('smart_assign_badge', 'basic', defaults)).toBe(false)
    expect(canAccessFeatureSwitch('quote_esign', 'pro', defaults)).toBe(false)
    expect(canAccessFeatureSwitch('review_requests', 'basic', defaults)).toBe(false)
  })

  it('turns on from the switch, not the subscription tier', () => {
    const switches = { ...getDefaultFeatureSwitchState(), quote_esign: true }
    expect(canAccessFeatureSwitch('quote_esign', 'pro', switches)).toBe(true)
    expect(canAccessFeatureSwitch('quote_esign', 'basic', switches)).toBe(true)
  })

  it('canUseFeature matches canAccessFeatureSwitch', () => {
    const switches = { ...getDefaultFeatureSwitchState(), inbound_sms: true }
    expect(canUseFeature('inbound_sms', 'basic', switches)).toBe(true)
    expect(canUseFeature('inbound_sms', 'basic', getDefaultFeatureSwitchState())).toBe(false)
  })
})

describe('resolveFeatureSwitchValue', () => {
  it('org override wins over brand and catalog', () => {
    expect(
      resolveFeatureSwitchValue('two_way_sms', {
        catalogDefault: true,
        brandValue: true,
        orgValue: false,
      })
    ).toBe(false)
    expect(
      resolveFeatureSwitchValue('two_way_sms', {
        catalogDefault: false,
        brandValue: false,
        orgValue: true,
      })
    ).toBe(true)
  })
})
