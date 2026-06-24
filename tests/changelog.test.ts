import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  APP_VERSION,
  CHANGELOG,
  formatChangelogDate,
  getUnseenChangelogEntries,
  markChangelogSeen,
  shouldShowChangelog,
} from '../src/lib/changelog'

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
)

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

  it('syncs package.json version with APP_VERSION', () => {
    expect(pkg.version).toBe(APP_VERSION)
  })

  it('uses DD-MM-YYYY dates in changelog entries', () => {
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{2}-\d{2}-\d{4}$/)
      expect(formatChangelogDate(entry.date)).toBe(entry.date)
    }
  })

  it('converts legacy ISO dates to DD-MM-YYYY', () => {
    expect(formatChangelogDate('2026-06-24')).toBe('24-06-2026')
  })
})
