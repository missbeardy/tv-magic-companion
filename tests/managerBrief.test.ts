import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCurrentManagerBriefCycle,
  getPreviousMonthStart,
  markManagerBriefSeen,
  shouldShowManagerBrief,
} from '../src/lib/managerBrief'

function createStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

describe('managerBrief', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows brief when current cycle has not been seen', () => {
    expect(shouldShowManagerBrief(new Date('2026-07-02T00:00:00.000Z'))).toBe(true)
  })

  it('shows once per cycle after marking as seen', () => {
    const julyDate = new Date('2026-07-02T00:00:00.000Z')
    markManagerBriefSeen(julyDate)

    expect(shouldShowManagerBrief(julyDate)).toBe(false)
    expect(shouldShowManagerBrief(new Date('2026-08-02T00:00:00.000Z'))).toBe(true)
  })

  it('builds consistent monthly cycle keys', () => {
    expect(getCurrentManagerBriefCycle(new Date(2026, 6, 1, 8, 0, 0))).toBe('2026-07')
    expect(getCurrentManagerBriefCycle(new Date(2026, 6, 31, 12, 0, 0))).toBe('2026-07')
  })

  it('returns prior month start across year boundaries', () => {
    const previous = getPreviousMonthStart(new Date(2026, 0, 15, 10, 0, 0))
    expect(previous.getFullYear()).toBe(2025)
    expect(previous.getMonth()).toBe(11)
    expect(previous.getDate()).toBe(1)
  })
})
