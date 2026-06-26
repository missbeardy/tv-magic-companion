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
  weekStarts: '22-06-2026',
  title: 'Navigation, bookings & app updates',
  items: [
    'Redesigned mobile bottom navigation with sliding pill indicator and Leads badge',
    'Cancel bookings from the calendar — leads move to a red Booking Cancelled column',
    'Calendar bookings auto-create leads and assign them to you',
    'Employee dashboard simplified to In Pool and Booked stats',
    'What\'s New overlay when the app updates',
    'Update now button refreshes the PWA cache to the latest version',
    'Changelog dates show as day-month-year',
    'Weekly What\'s New — shown once on the first update after each Monday',
    'Post-job Google review request SMS — confirm before send, toggle in Franchise Settings',
    'Review SMS fixes — fresh org settings, E.164 phone format, lead-based send',
    'In-app review request step in job complete flow (no browser confirm)',
    'Clearer SMS API auth errors when session or Supabase config is wrong',
    'Reporting groundwork — lead activity now records consistent agent, org and event details',
    'Reporting preview fix — activity logging matches the live lead events schema',
    'Reporting schema migration — add and backfill lead event actor tracking',
    'Reporting schema migration — add lead event payload metadata storage',
    'Completion status dropdown now opens the job completion checklist',
    'Manager monthly Reports page with month picker, conversion metrics, timing insights, and per-agent activity',
    'Phase 3 reporting snapshots + month-start manager brief, with monthly lost/completed kanban cleanup',
    'Modular feature kill switches by brand and franchise override in Platform Admin',
    'Smart Assign badge + Quote acceptance e-sign flow now behind per-franchise feature switches',
    'Brand-level quote email templates (subject + HTML) with org name, scope, and brand colours',
    'Platform Admin editor for quote email subject and HTML with live preview',
    'Unified feature switches — 10 brand rollout controls, tier-auto products, franchise overrides removed',
    'Team Activity — live feed of what your team is doing plus workload view for managers and employees',
    'Missed call auto-reply SMS — instant branded text to callers when a voicemail lead is created (feature switch)',
    'Inbound call hardening — DID org routing, voicemail dedup, no duplicate webhook voicemail leads',
    'Send ETA Text — opens branded on-the-way SMS on the technician\'s phone (customer_ontheway_sms switch)',
    'On-the-way SMS template simplified — generic message with optional maps link',
    'Missed call auto-reply now triggers from voicemail email (Cloudmailin) after lead creation',
    'Managers can book jobs on team calendars and schedule purple team meetings with SMS + push notifications',
    'Calendar colour legend — each employee has a distinct colour; team meetings show in purple',
    'Team meetings no longer auto-create leads from the appointment title alone',
    'All-employees calendar view shows one block per team meeting instead of duplicates',
  ],
}

/** App semver — keep in sync with package.json. */
export const APP_VERSION = '1.1.24'

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
