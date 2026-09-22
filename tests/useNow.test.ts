// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNow } from '../src/hooks/useNow'

describe('useNow (AUD-22)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ticks forward every second', () => {
    const { result, unmount } = renderHook(() => useNow())
    const first = result.current

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBeGreaterThan(first)

    unmount()
  })

  it('two components share one interval, not one each', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval')
    const { unmount: unmountA } = renderHook(() => useNow())
    const { unmount: unmountB } = renderHook(() => useNow())

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    unmountA()
    unmountB()
  })

  it('tears the interval down after the last consumer unmounts, and a later mount starts a fresh one', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    const { unmount } = renderHook(() => useNow())
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)

    const setIntervalSpy = vi.spyOn(window, 'setInterval')
    const { unmount: unmount2 } = renderHook(() => useNow())
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    unmount2()
  })
})
