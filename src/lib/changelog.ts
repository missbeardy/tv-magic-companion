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
  weekStarts: '21-09-2026', // Monday — update on first push after each Monday
  title: 'SMS replies thread onto jobs, and tighter account security',
  items: [
    'Tighter security: team members can only change the account settings their role allows',
    'Cancelling a booking shared with other technicians now asks a manager instead of half-cancelling it',
    'Technicians can send invoices from the job-complete checklist',
    'Reply STOP to opt out now opts the number out instead of creating another lead',
    'Offline call logs and pool pick-up no longer overwrite a lead that was booked or claimed on another phone',
    'Customer SMS replies now land on the existing job instead of opening a new lead',
    'In-app SMS send and receive from the lead sheet (Platform Admin can turn two-way SMS on)',
    'Feature switches can now be set per franchisee, not only per brand',
    'Lead extraction uses each org’s service types instead of a hardcoded TV list',
    'Reports, quotes, and AI parsing are no longer locked behind subscription tier',
    'The wall visualiser and quote page can now be branded per franchise (name, logo, colour)',
    'Fixed the leads board sometimes starting a drag instead of scrolling on a phone',
    'If one part of the app hits a problem, the rest keeps working instead of the whole app going down',
    'Fixed technicians\' location being polled three times over instead of once',
    'A few actions (removing a leave block, deleting a photo, changing your avatar, marking notifications read) now show an error instead of silently looking like they worked when they failed',
  ],
}

/** App semver — keep in sync with package.json. */
export const APP_VERSION = '1.1.200'

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
