export interface ChangelogEntry {
  version: string
  date: string
  title: string
  items: string[]
}

/** Newest release first — bump APP_VERSION when shipping. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.1',
    date: '2026-06-24',
    title: 'App Updates',
    items: [
      'What\'s New overlay when the app updates',
      'Update now button refreshes the PWA cache to the latest version',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-24',
    title: 'Navigation & Bookings',
    items: [
      'Redesigned mobile bottom navigation with sliding pill indicator and Leads badge',
      'Cancel bookings from the calendar — leads move to a red Booking Cancelled column',
      'Calendar bookings auto-create leads and assign them to you',
      'Employee dashboard simplified to In Pool and Booked stats',
    ],
  },
]

export const APP_VERSION = CHANGELOG[0]?.version ?? '1.0.0'

const STORAGE_KEY = 'companion-changelog-seen-version'

export function getSeenChangelogVersion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function markChangelogSeen(version: string = APP_VERSION): void {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    // private browsing / storage blocked
  }
}

export function shouldShowChangelog(): boolean {
  return getSeenChangelogVersion() !== APP_VERSION
}

/** Entries the user has not dismissed yet (newer than last seen version). */
export function getUnseenChangelogEntries(): ChangelogEntry[] {
  const seen = getSeenChangelogVersion()
  if (!seen) return CHANGELOG
  const seenIndex = CHANGELOG.findIndex((e) => e.version === seen)
  if (seenIndex === -1) return CHANGELOG
  if (seenIndex === 0) return []
  return CHANGELOG.slice(0, seenIndex)
}
