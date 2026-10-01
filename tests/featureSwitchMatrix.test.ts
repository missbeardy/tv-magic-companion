import { describe, expect, it } from 'vitest'
import {
  canAccessFeatureSwitch,
  getDefaultFeatureSwitchState,
  resolveFeatureSwitchValue,
} from '../src/lib/features'

describe('feature switch resolution matrix', () => {
  it('defaults OFF when no values exist', () => {
    expect(resolveFeatureSwitchValue('smart_assign_badge', {})).toBe(false)
    expect(resolveFeatureSwitchValue('two_way_sms', {})).toBe(false)
  })

  it('uses brand default when set', () => {
    expect(
      resolveFeatureSwitchValue('two_way_sms', {
        catalogDefault: false,
        brandValue: true,
      })
    ).toBe(true)
  })

  it('brand OFF wins over catalog ON', () => {
    expect(
      resolveFeatureSwitchValue('two_way_sms', {
        catalogDefault: true,
        brandValue: false,
      })
    ).toBe(false)
  })

  it('requires switch on; tier no longer blocks', () => {
    const on = getDefaultFeatureSwitchState()
    on.two_way_sms = true
    expect(canAccessFeatureSwitch('two_way_sms', 'pro', on)).toBe(true)
    expect(canAccessFeatureSwitch('two_way_sms', 'basic', on)).toBe(true)
  })

  it('org override wins over brand', () => {
    expect(
      resolveFeatureSwitchValue('two_way_sms', {
        catalogDefault: false,
        brandValue: true,
        orgValue: false,
      })
    ).toBe(false)
  })
})
