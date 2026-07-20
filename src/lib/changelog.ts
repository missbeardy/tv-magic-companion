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
  weekStarts: '20-07-2026',
  title: 'Stranger-ready Tier 2',
  items: [
    'Closed-loop quote → book → invoice → pay → review — accepting a quote deep-links managers into Book on the calendar with amount and scope pre-filled; when an invoice is marked paid, Auto Review Request on Paid can SMS the Google review link once per lead',
    'FieldBourne shell rebrand — PWA name/icon/manifest, login, captions, and receipts no longer say TVMagic outside the TV Magic brand\'s own data; draft keys migrate from tvmagic: to fieldbourne:',
    'In-app onboarding tips — team-mode coach tips for the pool timer, contact rounds, and next-action button (replay via ? on Leads); solo mode stays quiet',
    'Customer CSV import — Franchise Settings can upload a customer list (name/phone/email/address/notes), map columns, and merge duplicates by phone',
    'Solo tradie wedge preset — Platform Admin can create a new org with inbound, ack, quote, booking, invoice, review, price list, import, and tips switches turned on in one tick',
    'Demo + onboarding runbooks — docs/DEMO_RUNBOOK.md and scripts/demo-reset.sql for the 60-second pitch; founder provisioning runbook updated for the preset',
    'Engineering hygiene — removed dead Tasks board / web-push / SignatureCanvas; real README; tests under typecheck; sales pipeline backlog reconciled; migration-order hazard documented',
    'Positioning decision — FieldBourne stays a front-door add-on beside the tradie\'s existing tool; target solo price $69/mo GST-inc messaging-included (founding customers may differ); Xero live sync stays Tier 3',
    'Assigned leads stay with the technician — no auto-return to the pool; timer pill now counts up as time assigned (green 0–2h, amber 2–4h, red 4h+)',
  ],
}

/** App semver — keep in sync with package.json. */
export const APP_VERSION = '1.1.141'

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
