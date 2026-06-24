import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  APP_VERSION,
  WEEKLY_CHANGELOG,
  formatChangelogDate,
  getActiveWeeklyChangelog,
  getCurrentReleaseWeekId,
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

  it('shows changelog once per release week', () => {
    if (WEEKLY_CHANGELOG.weekStarts !== getCurrentReleaseWeekId()) return
    expect(shouldShowChangelog()).toBe(true)
    markChangelogSeen(getCurrentReleaseWeekId())
    expect(shouldShowChangelog()).toBe(false)
    expect(getUnseenChangelogEntries()).toHaveLength(0)
  })

  it('syncs package.json version with APP_VERSION', () => {
    expect(pkg.version).toBe(APP_VERSION)
  })

  it('uses DD-MM-YYYY for weekStarts', () => {
    expect(WEEKLY_CHANGELOG.weekStarts).toMatch(/^\d{2}-\d{2}-\d{4}$/)
    expect(formatChangelogDate(WEEKLY_CHANGELOG.weekStarts)).toBe(WEEKLY_CHANGELOG.weekStarts)
  })

  it('converts legacy ISO dates to DD-MM-YYYY', () => {
    expect(formatChangelogDate('2026-06-24')).toBe('24-06-2026')
  })

  it('returns Monday as release week id', () => {
    const wed = new Date(2026, 5, 24)
    expect(getCurrentReleaseWeekId(wed)).toBe('22-06-2026')
  })

  it('active weekly changelog matches current week', () => {
    const active = getActiveWeeklyChangelog()
    if (WEEKLY_CHANGELOG.weekStarts === getCurrentReleaseWeekId()) {
      expect(active).not.toBeNull()
      expect(active?.items.length).toBeGreaterThan(0)
    } else {
      expect(active).toBeNull()
    }
  })
})
