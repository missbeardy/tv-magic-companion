import { describe, expect, it } from 'vitest'
import { getSmartAssignDecision } from '../src/lib/smartAssign'

describe('getSmartAssignDecision', () => {
  it('keeps badge hidden when feature switch is off', () => {
    const result = getSmartAssignDecision({
      featureEnabled: false,
      role: 'manager',
      activeCount: 1,
      minimumActiveCount: 1,
      isNearest: true,
    })
    expect(result.isRecommended).toBe(true)
    expect(result.showBadge).toBe(false)
  })

  it('shows badge when feature switch is on and candidate is recommended', () => {
    const result = getSmartAssignDecision({
      featureEnabled: true,
      role: 'manager',
      activeCount: 2,
      minimumActiveCount: 2,
      isNearest: false,
    })
    expect(result.isRecommended).toBe(true)
    expect(result.showBadge).toBe(true)
  })

  it('does not show badge for employee self-assign mode', () => {
    const result = getSmartAssignDecision({
      featureEnabled: true,
      role: 'employee',
      activeCount: 0,
      minimumActiveCount: 0,
      isNearest: true,
    })
    expect(result.showBadge).toBe(false)
  })
})
