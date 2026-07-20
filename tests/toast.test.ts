import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  showToast,
  dismissToast,
  clearToasts,
  subscribeToasts,
  type ToastItem,
} from '../src/lib/toast'

beforeEach(() => {
  clearToasts()
})

afterEach(() => {
  clearToasts()
  vi.useRealTimers()
})

function currentToasts(): ToastItem[] {
  let snapshot: ToastItem[] = []
  const unsub = subscribeToasts((items) => {
    snapshot = items
  })
  unsub()
  return snapshot
}

describe('toast store', () => {
  it('delivers the current list immediately on subscribe', () => {
    const seen: ToastItem[][] = []
    const unsub = subscribeToasts((items) => seen.push(items))
    expect(seen[0]).toEqual([])
    unsub()
  })

  it('adds a toast with sensible defaults', () => {
    showToast({ message: 'hello' })
    const items = currentToasts()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ message: 'hello', variant: 'info' })
    expect(items[0]?.id).toBeTruthy()
  })

  it('preserves an action and variant', () => {
    const onClick = vi.fn()
    showToast({ message: 'failed', variant: 'error', action: { label: 'Retry', onClick }, durationMs: 0 })
    const items = currentToasts()
    expect(items[0]?.variant).toBe('error')
    expect(items[0]?.action?.label).toBe('Retry')
    items[0]?.action?.onClick()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('dismisses a toast by id', () => {
    const id = showToast({ message: 'x', durationMs: 0 })
    expect(currentToasts()).toHaveLength(1)
    dismissToast(id)
    expect(currentToasts()).toHaveLength(0)
  })

  it('auto-dismisses after the given duration', () => {
    vi.useFakeTimers()
    showToast({ message: 'temp', durationMs: 3000 })
    expect(currentToasts()).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    expect(currentToasts()).toHaveLength(0)
  })

  it('keeps a sticky toast (durationMs 0) until dismissed', () => {
    vi.useFakeTimers()
    showToast({ message: 'sticky', durationMs: 0 })
    vi.advanceTimersByTime(60_000)
    expect(currentToasts()).toHaveLength(1)
  })
})
