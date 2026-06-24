import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  APP_VERSION,
  CHANGELOG,
  getUnseenChangelogEntries,
  markChangelogSeen,
  shouldShowChangelog,
} from '../src/lib/changelog'

function createStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

describe('changelog', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows changelog when never seen', () => {
    expect(shouldShowChangelog()).toBe(true)
    expect(getUnseenChangelogEntries().length).toBeGreaterThan(0)
  })

  it('hides changelog after marking current version seen', () => {
    markChangelogSeen(APP_VERSION)
    expect(shouldShowChangelog()).toBe(false)
    expect(getUnseenChangelogEntries()).toHaveLength(0)
  })

  it('exposes a current app version matching latest entry', () => {
    expect(APP_VERSION).toBe(CHANGELOG[0].version)
  })
})
