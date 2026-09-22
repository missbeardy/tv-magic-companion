// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const updateEq = vi.fn().mockResolvedValue({ error: null })
const updateMock = vi.fn(() => ({ eq: updateEq }))

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ update: updateMock })),
  },
}))

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'tech-1', location_enabled: true, role: 'employee' } }),
}))

vi.mock('../src/context/OrgContext', () => ({
  useOrg: () => ({ isFeatureEnabled: () => true, featureSwitchesLoading: false }),
}))

import { useTechLocation } from '../src/hooks/useTechLocation'

function mockGeolocation() {
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    success({ coords: { latitude: -27, longitude: 153 } } as GeolocationPosition)
  })
  Object.defineProperty(global.navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  })
  return getCurrentPosition
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useTechLocation — visibility-gated polling (AUD-11)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    updateMock.mockClear()
    updateEq.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls immediately while the tab is visible', () => {
    setVisibility('visible')
    const getCurrentPosition = mockGeolocation()
    const { unmount } = renderHook(() => useTechLocation('tech-1'))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('does not poll at mount when the tab starts hidden', () => {
    setVisibility('hidden')
    const getCurrentPosition = mockGeolocation()
    const { unmount } = renderHook(() => useTechLocation('tech-1'))
    expect(getCurrentPosition).not.toHaveBeenCalled()
    unmount()
  })

  it('stops the interval when the tab is hidden, resumes when visible again', () => {
    setVisibility('visible')
    const getCurrentPosition = mockGeolocation()
    const { unmount } = renderHook(() => useTechLocation('tech-1'))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
    unmount()
  })
})
