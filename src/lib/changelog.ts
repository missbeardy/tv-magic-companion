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
  weekStarts: '13-07-2026',
  title: 'Lead management',
  items: [
    'Remove lead — managers and platform admins can soft-delete a lead with a mandatory reason; the lead disappears from kanban and reports but stays in the database for audit',
    'Inbound auto-assign — team-mode inbound leads can auto-assign to the best available technician (workload + proximity), gated by the Inbound Auto-Assign feature switch',
    'Hidden test profiles — platform admins can mark org members as hidden test profiles so they stay available for testing but are excluded from assign and auto-assign',
    'Fix leads page load after soft-delete migration (disambiguate assigned technician profile join)',
    'Fix Platform Admin org members panel on production (profiles table has no email column)',
    'Previous jobs — the lead detail sheet now shows a read-only history of the customer\'s earlier jobs (service type, status, when, and suburb). Available when Customer Profiles is enabled for your brand; leads with no linked customer are unaffected',
    'Facebook Messenger leads via Botpress Studio — POST /api/inbound-facebook-lead creates unassigned leads from Messenger (enable Inbound Meta Messaging in Platform feature switches)',
    'Centralized lead extraction — Claude + SMS/email fallbacks in api/_lib/extractLead.ts',
    'Extraction status on leads — managers see failed/fallback/pending badge and can retry extraction from lead detail',
    'Removed unused 3CX missed-call webhook (inbound-calls) — frees one Vercel serverless function slot',
    'Fix Platform inbound email simulator auth on Preview (header casing)',
    'Inbound auto-assign now skips managers — leads auto-assign only to technicians (employees); if no technician is available the lead stays unassigned and managers are notified',
    'Stage 3 Acknowledgment — instant customer ack SMS (with callback SLA copy) and email ack for email-only leads, manager push on new unassigned lead; shipped dark (lead_ack_sms, lead_ack_email, manager_new_lead_alerts all off by default, enable per brand when ready)',
    'Lead acknowledgement email is a separate feature switch (lead_ack_email) — independent of SMS ack',
    'Platform Admin brand template editor — edit SMS and lead ack email copy per brand (SLA, manager alerts, etc.)',
    'Phone-first quoting — SMS quote link by default, Total incl. GST, mobile bottom-sheet composer',
    'Next-action CTAs on lead cards/sheets by status (Call / Quote / Book / Complete)',
    'Completions only via checklist — drag or status menu cannot skip invoice/review flow',
    'Branded quote accept page with decline; accept notifies managers and opens Book with quote amount',
    'Customer booking confirmation SMS + email with .ics calendar invite',
    'Offline queue for call/SMS attempts and lead photos; mobile nav focuses Dashboard / Leads / Calendar',
  ],
}

/** App semver — keep in sync with package.json. */
export const APP_VERSION = '1.1.121'

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
