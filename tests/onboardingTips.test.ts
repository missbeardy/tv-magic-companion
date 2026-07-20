import { describe, expect, it } from 'vitest'
import {
  emptyOnboardingTipsState,
  ONBOARDING_TIPS,
  resolveNextTip,
  type OnboardingTipContext,
} from '../src/lib/onboardingTips'

const teamBase: OnboardingTipContext = {
  isSoloMode: false,
  hasPooledLead: true,
  hasContactAttemptedLead: true,
  hasAnyLead: true,
}

describe('resolveNextTip', () => {
  it('returns null in solo mode', () => {
    expect(resolveNextTip(emptyOnboardingTipsState(), { ...teamBase, isSoloMode: true })).toBeNull()
  })

  it('starts with pool_timer when a pooled lead is visible', () => {
    const tip = resolveNextTip(emptyOnboardingTipsState(), teamBase)
    expect(tip?.id).toBe('pool_timer')
  })

  it('skips pool_timer when no pooled lead', () => {
    const tip = resolveNextTip(emptyOnboardingTipsState(), {
      ...teamBase,
      hasPooledLead: false,
    })
    expect(tip?.id).toBe('contact_rounds')
  })

  it('advances past dismissed tips', () => {
    const tip = resolveNextTip(
      { dismissed: ['pool_timer'], replay: false },
      teamBase
    )
    expect(tip?.id).toBe('contact_rounds')
  })

  it('returns null when all tips dismissed', () => {
    expect(
      resolveNextTip(
        { dismissed: ONBOARDING_TIPS.map((t) => t.id), replay: false },
        teamBase
      )
    ).toBeNull()
  })

  it('replay restarts from the first eligible tip', () => {
    const tip = resolveNextTip(
      { dismissed: ONBOARDING_TIPS.map((t) => t.id), replay: true },
      teamBase
    )
    expect(tip?.id).toBe('pool_timer')
  })
})
