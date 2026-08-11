export interface ChangelogEntry {
  version: string
  /** Display date in DD-MM-YYYY (week starting Monday). */
  date: string
  title: string
  items: string[]
}

export interface WeeklyChangelog {
  /** Monday that starts this release week (DD-MM-YYYY). */
  weekStarts: string
  title: string
  items: string[]
}

/** Format today as DD-MM-YYYY. */
export function todayChangelogDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** Monday (local time) for the week containing `date`, as DD-MM-YYYY. */
export function getCurrentReleaseWeekId(date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const daysFromMonday = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - daysFromMonday)
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

/**
 * Current week's release notes. Append `items` during the week; on the first push
 * after Monday, set `weekStarts` to that Monday (use getCurrentReleaseWeekId()).
 */
export const WEEKLY_CHANGELOG: WeeklyChangelog = {
  weekStarts: '10-08-2026', // Monday — update on first push after each Monday
  title: 'Reliability, privacy and speed',
  items: [
    'Faster first load, especially on mobile — reports, calendar, platform admin, and public quote/invoice pages now load on demand instead of shipping to everyone up front',
    'Sending a quote no longer shows a failure when the email or SMS is just slow — the quote saves first and confirms "saved, still sending", so you never send the same quote twice',
    'Added Privacy Policy and Terms of Service pages, an in-app "Delete my account" option, and a public account-deletion request page',
    'Deleting a staff account no longer removes their customer bookings from the calendar — the business keeps its records',
    'Automated customer SMS (enquiry acknowledgement, booking reminders, quote/invoice follow-ups) now includes a reply-STOP opt-out line',
    'Added error monitoring and product analytics behind the scenes, with customer names/phones/addresses/photos scrubbed before anything leaves the app',
    'Rate limiting on AI parsing, SMS, geocoding, and public quote/invoice links is now honest under real traffic — the old per-instance counter reset on every cold start and could be bypassed by spreading requests across concurrent connections',
    'AI lead-parsing now builds its prompt server-side with a per-franchise monthly usage limit, closing an open-ended AI proxy',
    'Every authenticated API request now does one fewer database round trip under the hood — should shave a little latency off writes on weak signal',
    'Removed a duplicate, unused app manifest that could silently drift from the real one',
    'Fixed follow-up reminders repeating every 15 minutes on the same lead — technicians were getting thousands of duplicate notifications a day, and it was timing out the background job that also sends invoice/quote chases and booking reminders',
    'Leads with no contact for 14 days are now automatically marked Lost (booked jobs are never touched), so dead leads stop nagging forever',
    'In-app notifications older than 30 days are now cleaned up automatically',
    'Replaced the app icon and favicon with FieldBourne’s real logo (was showing the client’s TV Magic logo)',
    'Removed parked Instagram/Facebook social posting (Zernio) and AI caption generation — never UAT’d, frees a server function slot',
    'Cleaned up leftover dead code: dropped unused Tasks database tables, removed the unused push-notify edge function, and fixed broken notification icon paths after the logo swap',
    'You can now flag jobs a team member can’t do (e.g. Starlink) under Profile → Team Management — auto-assign skips them, and assigning by hand warns first. If nobody on the team can do it, the lead stays in the pool instead of going to the wrong person',
  ],
}

/** App semver — keep in sync with package.json. */
export const APP_VERSION = '1.1.172'

const STORAGE_KEY = 'companion-changelog-seen-week'

export function getSeenReleaseWeek(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function markChangelogSeen(weekId: string = getCurrentReleaseWeekId()): void {
  try {
    localStorage.setItem(STORAGE_KEY, weekId)
  } catch {
    // private browsing / storage blocked
  }
}

export function getActiveWeeklyChangelog(): WeeklyChangelog | null {
  const currentWeek = getCurrentReleaseWeekId()
  if (WEEKLY_CHANGELOG.weekStarts !== currentWeek) return null
  if (WEEKLY_CHANGELOG.items.length === 0) return null
  return WEEKLY_CHANGELOG
}

/** Show once per release week (first visit after Monday's deploy). */
export function shouldShowChangelog(): boolean {
  const active = getActiveWeeklyChangelog()
  if (!active) return false
  return getSeenReleaseWeek() !== getCurrentReleaseWeekId()
}

/** Map active weekly notes for the overlay. */
export function getUnseenChangelogEntries(): ChangelogEntry[] {
  const active = getActiveWeeklyChangelog()
  if (!active || !shouldShowChangelog()) return []
  return [{
    version: APP_VERSION,
    date: active.weekStarts,
    title: active.title,
    items: active.items,
  }]
}
