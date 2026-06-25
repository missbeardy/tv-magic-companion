import { describe, expect, it } from 'vitest'
import { resolveFeatureSwitchValue } from '../src/lib/features'

describe('feature switch resolution matrix', () => {
  it('defaults OFF when no values exist', () => {
    expect(resolveFeatureSwitchValue('smart_assign_badge', {})).toBe(false)
    expect(resolveFeatureSwitchValue('quote_esign', {})).toBe(false)
  })

  it('uses brand default when no org override', () => {
    expect(
      resolveFeatureSwitchValue('quote_esign', {
        catalogDefault: false,
        brandValue: true,
        orgOverride: null,
      })
    ).toBe(true)
  })

  it('org override OFF wins over brand ON', () => {
    expect(
      resolveFeatureSwitchValue('quote_esign', {
        catalogDefault: false,
        brandValue: true,
        orgOverride: false,
      })
    ).toBe(false)
  })

  it('org override ON wins over brand OFF', () => {
    expect(
      resolveFeatureSwitchValue('quote_esign', {
        catalogDefault: false,
        brandValue: false,
        orgOverride: true,
      })
    ).toBe(true)
  })
})
