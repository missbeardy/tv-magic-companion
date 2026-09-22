// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

let onCallback: (() => void) | null = null
const channelMock = vi.fn((_name: string) => ({
  on: vi.fn((_event: string, _filter: unknown, cb: () => void) => {
    onCallback = cb
    return { subscribe: vi.fn(() => 'subscribed-channel') }
  }),
}))
const removeChannelMock = vi.fn()

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: (name: string) => channelMock(name),
    removeChannel: (channel: unknown) => removeChannelMock(channel),
  },
}))

import { useOrgLeadsRealtime } from '../src/hooks/useOrgLeadsRealtime'

describe('useOrgLeadsRealtime (AUD-12)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    channelMock.mockClear()
    removeChannelMock.mockClear()
    onCallback = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens exactly one channel for two components on the same org', () => {
    const listenerA = vi.fn()
    const listenerB = vi.fn()
    const { unmount: unmountA } = renderHook(() => useOrgLeadsRealtime('org-1', listenerA))
    const { unmount: unmountB } = renderHook(() => useOrgLeadsRealtime('org-1', listenerB))

    expect(channelMock).toHaveBeenCalledTimes(1)
    expect(channelMock).toHaveBeenCalledWith('org-leads-org-1')

    unmountA()
    unmountB()
  })

  it('debounces a burst of changes into one fan-out call per listener', () => {
    const listener = vi.fn()
    const { unmount } = renderHook(() => useOrgLeadsRealtime('org-2', listener))

    onCallback?.()
    onCallback?.()
    onCallback?.()
    expect(listener).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)
    expect(listener).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('tears the channel down only after the last listener unmounts', () => {
    const listenerA = vi.fn()
    const listenerB = vi.fn()
    const { unmount: unmountA } = renderHook(() => useOrgLeadsRealtime('org-3', listenerA))
    const { unmount: unmountB } = renderHook(() => useOrgLeadsRealtime('org-3', listenerB))

    unmountA()
    expect(removeChannelMock).not.toHaveBeenCalled()

    unmountB()
    expect(removeChannelMock).toHaveBeenCalledTimes(1)
  })

  it('does nothing without an orgId', () => {
    const listener = vi.fn()
    const { unmount } = renderHook(() => useOrgLeadsRealtime(undefined, listener))
    expect(channelMock).not.toHaveBeenCalled()
    unmount()
  })
})
