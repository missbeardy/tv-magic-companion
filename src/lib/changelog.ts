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
  weekStarts: '29-06-2026',
  title: 'Platform admin & feature rollout',
  items: [
    'Platform admin feature switches redesigned — brand selector and categorized toggles',
    'Platform feature switch categories collapse into accordions with on/off counts',
    'Feature switch accordion headers tint to the selected brand primary colour',
    'Stronger brand tint on feature switch accordion headers (left accent + coloured title)',
    'Feature switch headers use inline brand tint; swatch shows brand template colour vs nav',
    'Platform admin: edit brand template colours on Feature switches (separate from Franchise Settings org colours)',
    'Solo operation mode — simplified leads inbox for owner-operators with paste enquiry and auto-claim inbound SMS',
    'Facebook Messenger webhook scaffold (meta-webhook via inbound-sms)',
    'Platform admin: change operation mode (solo vs team) on existing franchisees',
    'Solo Leads on desktop: Inbox / Active / Done tabs instead of six columns at once',
    'Solo Leads desktop layout: stacked columns aligned with mobile; removed subtitle',
    'One-tap invoice email at job completion — custom HTML/PDF templates and payment instructions in Org Settings (off by default)',
    'Lead acknowledgement SMS — instant branded thank-you text to customers on new inbound leads (off by default)',
    'Lead ack SMS includes franchise contact number from Franchise Settings when set',
    'Platform admin feature switches: franchisee picker and per-brand org list for clearer rollout',
    'Google address autocomplete on calendar bookings, lead cards, and new-lead forms (AU Places)',
    'Lead card address updates sync to upcoming linked calendar bookings',
    'Assignment contact timer extended from 2 hours to 4 hours before auto-unassign',
    'Fix preview deploy type errors for Places API and inbound email handlers',
    'Merge Places autocomplete into geocode API to stay within Vercel Hobby function limit',
    'Fix address autocomplete dropdown not showing after API returned mapped suggestions',
    'Leads kanban: compact mobile cards with suburb, assignee avatars, and bottom detail sheet',
    'Lead drawer: grouped actions, address edit/navigate, and sticky primary button on mobile',
    'Calendar: week view as default; mobile week scrolls horizontally with swipeable day columns',
    'Calendar: manager resource view (all technicians) limited to Day view only',
    'Remove static map thumbnails from lead cards and calendar to reduce Google Maps API usage',
    'Lead detail drawer: close (X) button and browser back/swipe dismisses sheet without leaving Leads',
    'Inbound leads save immediately before AI parsing — email, SMS, and voicemail no longer lost on extraction failure',
    'Inbound email now alerts managers on new lead; inbound SMS manager alerts fixed',
    'Three-attempt contact follow-up: 4h rollover to Second/Third attempt, then Lost (Unable to contact)',
    'Contact follow-up extended to six attempts — 4h rollover through Sixth attempt before Lost',
    'Fix production inbound SMS 500 — add missing api/_lib/rawFirstLead module to deploy bundle',
    'Contact follow-up stays in Contact Attempted — six attempts with 6h escalation and visual attempt labels',
    'Inbound raw-first bundle tests — guard against missing rawFirstLead exports on SMS/email/voicemail handlers',
    'Contact follow-up cron every 15 min — escalates attempts and notifies assignee in-app',
    'Contact notes on lead cards while in Contact Attempted',
    'Contact follow-up labels: 2nd–5th Attempt on each contact; yellow bubble shows time only; 6th contact → lost',
  ],
}

/** App semver — keep in sync with package.json. */
export const APP_VERSION = '1.1.56'

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
