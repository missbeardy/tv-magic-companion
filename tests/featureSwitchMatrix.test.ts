import { describe, expect, it } from 'vitest'
import {
  canAccessFeatureSwitch,
  getDefaultFeatureSwitchState,
  resolveFeatureSwitchValue,
} from '../src/lib/features'

describe('feature switch resolution matrix', () => {
  it('defaults OFF when no values exist', () => {
    expect(resolveFeatureSwitchValue('smart_assign_badge', {})).toBe(false)
    expect(resolveFeatureSwitchValue('quote_esign', {})).toBe(false)
  })

  it('uses brand default when set', () => {
    expect(
      resolveFeatureSwitchValue('quote_esign', {
        catalogDefault: false,
        brandValue: true,
      })
    ).toBe(true)
  })

  it('brand OFF wins over catalog ON', () => {
    expect(
      resolveFeatureSwitchValue('quote_esign', {
        catalogDefault: true,
        brandValue: false,
      })
    ).toBe(false)
  })

  it('requires tier and switch for effective access', () => {
    const on = getDefaultFeatureSwitchState()
    on.quote_esign = true
    expect(canAccessFeatureSwitch('quote_esign', 'pro', on)).toBe(true)
    expect(canAccessFeatureSwitch('quote_esign', 'basic', on)).toBe(false)
  })
})
