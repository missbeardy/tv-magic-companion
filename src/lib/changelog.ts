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
  weekStarts: '06-07-2026',
  title: 'Assign modal & pipeline polish',
  items: [
    'Assign lead modal closes immediately after DB update — notifications and WhatsApp run in background',
    'Fix assignment WhatsApp/SMS — resolve assignee phone server-side and fire alert before modal closes',
    'PWA app updates — refresh icon in nav with badge when cache is stale; no more blocking update overlay',
    'Remove unused Tasks from navigation and routing',
    'Nav refresh button reloads the app when no PWA update is pending',
    'Remove DEFAULT_ORG_ID fallback — unmapped inbound captured in unrouted_inbound with platform alert SMS',
    'Platform simulator: Unrouted option to test capture without curl',
    'Voicemail via CloudMailin: route org from plus-tag (+default), not 3CX extension',
    'Platform admin: Workflow Runs trace view — filterable run list, step graph, error payload panel',
    'Platform admin: accordion sections on Platform page; inbound simulator uses create-user API route locally',
    'Platform admin: Workflow Runs kanban row — actual lead lifecycle path from lead events, bridged from inbound ack SMS',
    'Platform admin: Workflow Runs list links each run to its lead (name + service type)',
    'Overdue invoice chase — scheduled SMS/email reminders at 3/7/14 days past due (off by default, pro+)',
    'Fix contact-follow-up in-app notifications — rebuild notifications_type_check to include contact_follow_up and legacy types',
    'Quote follow-up chase — scheduled SMS/email nudges at 48h and 5 days after quote sent (off by default, pro+)',
    'Fix iPhone lead calls — dialer opens immediately before status update (iOS Safari user-gesture fix)',
    'Calendar visual redesign — Fergus-style tinted job cards, org-theme colours, today marker and current-time line',
    'Lead photos — private storage bucket with signed URLs (org-scoped access)',
    'Support & Feedback form requires login — server escapes content, verifies attachment ownership, replies route to the reporter',
    'Contact follow-up reminders — in-app bell only; no push, SMS, or WhatsApp to assignee',
    'Edit lead contact details — fix a wrong name, phone, or email from the lead sheet; future bookings update to match',
  ],
}

/** App semver — keep in sync with package.json. */
export const APP_VERSION = '1.1.106'

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
