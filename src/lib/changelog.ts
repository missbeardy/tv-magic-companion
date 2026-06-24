export interface ChangelogEntry {
  version: string
  /** Display date in DD-MM-YYYY (e.g. 24-06-2026). */
  date: string
  title: string
  items: string[]
}

/** Format today as DD-MM-YYYY for new changelog entries. */
export function todayChangelogDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** Normalize legacy ISO (YYYY-MM-DD) or validate DD-MM-YYYY for display. */
export function formatChangelogDate(date: string): string {
  if (/^\d{2}-\d{2}-\d{4}$/.test(date)) return date
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`
  return date
}

/** Newest release first — bump APP_VERSION when shipping. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.2',
    date: '24-06-2026',
    title: 'Release notes',
    items: [
      'Changelog dates now show as day-month-year',
      'Every app update includes What\'s New notes automatically',
    ],
  },
  {
    version: '1.1.1',
    date: '24-06-2026',
    title: 'App Updates',
    items: [
      'What\'s New overlay when the app updates',
      'Update now button refreshes the PWA cache to the latest version',
    ],
  },
  {
    version: '1.1.0',
    date: '24-06-2026',
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
