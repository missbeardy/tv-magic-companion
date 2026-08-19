/**
 * Weekly team leaderboard — week maths, roster merge, sorting, validation, and I/O.
 *
 * All week logic is Monday-anchored to match the database CHECK (`ISODOW = 1`) and the
 * changelog release week. Dates are handled as *local* calendar days and stored in a
 * bare `YYYY-MM-DD` date column, so a technician in Brisbane and a manager in Perth
 * looking at "this week" see the same board without a timezone shifting the boundary.
 */
import { supabase } from './supabase'
import type { Database } from '../types/database.types'
import type { OrgProfile } from '../hooks/useOrgProfiles'

export type WeeklyLeaderboardEntryRow =
  Database['public']['Tables']['weekly_leaderboard_entries']['Row']
type WeeklyLeaderboardEntryInsert =
  Database['public']['Tables']['weekly_leaderboard_entries']['Insert']

export interface LeaderboardRow {
  technicianId: string
  name: string
  avatarUrl: string | null
  jobsCompleted: number
  salesAmount: number
  /** False when the technician has no saved row for the week (shown as zeros). */
  hasEntry: boolean
}

/** What a manager has typed but not yet saved, keyed by technician id. */
export interface LeaderboardDraftValue {
  jobs: string
  sales: string
}

export type LeaderboardDraft = Record<string, LeaderboardDraftValue>

// ── Week maths ────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000

/** Strip the clock off a Date, keeping its local calendar day. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Monday (local) of the week containing `date`. Sunday belongs to the week before. */
export function getWeekStart(date: Date = new Date()): Date {
  const d = startOfLocalDay(date)
  const weekday = d.getDay()
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1
  d.setDate(d.getDate() - daysFromMonday)
  return d
}

/** Sunday (local) that closes the week starting at `weekStart`. */
export function getWeekEnd(weekStart: Date): Date {
  const d = startOfLocalDay(weekStart)
  d.setDate(d.getDate() + 6)
  return d
}

/** `YYYY-MM-DD` for a local calendar day — never `toISOString()`, which shifts to UTC. */
export function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Parse a stored `YYYY-MM-DD` back to a local midnight Date. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addWeeks(weekStart: Date, weeks: number): Date {
  const d = startOfLocalDay(weekStart)
  d.setDate(d.getDate() + weeks * 7)
  return d
}

export function isCurrentWeek(weekStart: Date, now: Date = new Date()): boolean {
  return toDateKey(weekStart) === toDateKey(getWeekStart(now))
}

/** Future weeks have no meaning on a hand-maintained scoreboard, so Next stops at today. */
export function canGoToNextWeek(weekStart: Date, now: Date = new Date()): boolean {
  return startOfLocalDay(weekStart).getTime() < getWeekStart(now).getTime()
}

/** How many weeks back `weekStart` sits from the current week (0 = this week). */
export function weeksAgo(weekStart: Date, now: Date = new Date()): number {
  const diff = getWeekStart(now).getTime() - startOfLocalDay(weekStart).getTime()
  return Math.round(diff / (MS_PER_DAY * 7))
}

const DAY_MONTH = new Intl.DateTimeFormat('en-AU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-AU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/**
 * e.g. "Mon 17 Aug – Sun 23 Aug 2026". Both weekdays are named on purpose: the whole
 * scoreboard hinges on everyone agreeing where the week starts and ends.
 */
export function formatWeekRange(weekStart: Date): string {
  const end = getWeekEnd(weekStart)
  return `${DAY_MONTH.format(weekStart)} – ${DAY_MONTH_YEAR.format(end)}`
}

/** Short relative name for the week: "This week", "Last week", or the range. */
export function formatWeekName(weekStart: Date, now: Date = new Date()): string {
  const back = weeksAgo(weekStart, now)
  if (back === 0) return 'This week'
  if (back === 1) return 'Last week'
  return formatWeekRange(weekStart)
}

// ── Formatting ────────────────────────────────────────────────────────────────

const AUD = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const AUD_EXACT = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Whole dollars for display — cents are noise on a wall chart. */
export function formatAud(amount: number): string {
  return AUD.format(amount)
}

export function formatAudExact(amount: number): string {
  return AUD_EXACT.format(amount)
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean
  value: number
  error: string | null
}

/** Jobs are whole, non-negative counts. Blank means zero, not "unset". */
export function validateJobs(raw: string): ValidationResult {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: 0, error: null }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, value: 0, error: 'Jobs must be a whole number' }
  }
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) {
    return { ok: false, value: 0, error: 'Jobs must be a whole number' }
  }
  return { ok: true, value, error: null }
}

/**
 * Sales accept what a person actually types into a phone: `1200`, `1,200.50`, `$1200`.
 * Stored to 2dp to match `numeric(12,2)`, so a third decimal is rejected rather than
 * silently rounded into a number the manager did not enter.
 */
export function validateSales(raw: string): ValidationResult {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: 0, error: null }
  const cleaned = trimmed.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, value: 0, error: 'Sales must be an amount like 1250 or 1250.50' }
  }
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, value: 0, error: 'Sales must be an amount like 1250 or 1250.50' }
  }
  // numeric(12,2) allows 10 digits before the decimal point.
  if (value > 9_999_999_999) {
    return { ok: false, value: 0, error: 'Sales amount is too large' }
  }
  return { ok: true, value: Math.round(value * 100) / 100, error: null }
}

// ── Roster merge and sorting ──────────────────────────────────────────────────

/**
 * The roster is authoritative, not the saved rows: every visible employee appears
 * (zeros if unscored), and a saved row for someone since hidden by `profileVisibility`
 * or moved off `employee` does not resurrect them onto the board.
 */
export function mergeRosterWithEntries(
  employees: Pick<OrgProfile, 'id' | 'full_name' | 'avatar_url'>[],
  entries: WeeklyLeaderboardEntryRow[]
): LeaderboardRow[] {
  const byTech = new Map(entries.map((e) => [e.technician_id, e]))
  return employees.map((employee) => {
    const entry = byTech.get(employee.id)
    return {
      technicianId: employee.id,
      name: employee.full_name || 'Unnamed',
      avatarUrl: employee.avatar_url ?? null,
      jobsCompleted: entry ? Number(entry.jobs_completed) : 0,
      salesAmount: entry ? Number(entry.sales_amount) : 0,
      hasEntry: Boolean(entry),
    }
  })
}

/**
 * Sales descending is the headline. Ties break on jobs descending then name ascending
 * so the podium never reshuffles between renders — an all-zero week must still produce
 * the same order every time.
 */
export function sortLeaderboardRows(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    if (b.salesAmount !== a.salesAmount) return b.salesAmount - a.salesAmount
    if (b.jobsCompleted !== a.jobsCompleted) return b.jobsCompleted - a.jobsCompleted
    return a.name.localeCompare(b.name)
  })
}

export function hasAnyResults(rows: LeaderboardRow[]): boolean {
  return rows.some((r) => r.salesAmount > 0 || r.jobsCompleted > 0)
}

// ── Draft diffing ─────────────────────────────────────────────────────────────

export interface DraftDiffResult {
  changed: Array<{ technicianId: string; jobsCompleted: number; salesAmount: number }>
  errors: Record<string, string>
}

/**
 * Compare typed values against what is already saved. Only genuinely changed rows are
 * upserted, so saving an untouched week is a no-op rather than a write per technician
 * that would each restamp `updated_by`.
 */
export function diffDraft(rows: LeaderboardRow[], draft: LeaderboardDraft): DraftDiffResult {
  const changed: DraftDiffResult['changed'] = []
  const errors: Record<string, string> = {}

  for (const row of rows) {
    const typed = draft[row.technicianId]
    if (!typed) continue

    const jobs = validateJobs(typed.jobs)
    const sales = validateSales(typed.sales)

    if (!jobs.ok || !sales.ok) {
      errors[row.technicianId] = jobs.error ?? sales.error ?? 'Invalid value'
      continue
    }

    if (jobs.value === row.jobsCompleted && sales.value === row.salesAmount) continue
    changed.push({
      technicianId: row.technicianId,
      jobsCompleted: jobs.value,
      salesAmount: sales.value,
    })
  }

  return { changed, errors }
}

/** Seed the edit fields from what is currently on the board. */
export function buildDraft(rows: LeaderboardRow[]): LeaderboardDraft {
  const draft: LeaderboardDraft = {}
  for (const row of rows) {
    draft[row.technicianId] = {
      jobs: String(row.jobsCompleted),
      sales: String(row.salesAmount),
    }
  }
  return draft
}

// ── Movement, gaps, and the reveal ────────────────────────────────────────────

/**
 * Rank change against last week. Positive = moved up, negative = down, `null` = no
 * comparison possible (new to the board, or last week was never posted).
 *
 * This is the number that gives someone in 5th a reason to look: they are not winning,
 * but they moved up two, and that is a result.
 */
export function computeMovement(
  current: LeaderboardRow[],
  previous: LeaderboardRow[]
): Map<string, number | null> {
  const movement = new Map<string, number | null>()

  // An unposted previous week would read as "everyone climbed", which is a lie.
  if (!hasAnyResults(previous)) {
    for (const row of current) movement.set(row.technicianId, null)
    return movement
  }

  const previousRank = new Map<string, number>()
  sortLeaderboardRows(previous).forEach((row, index) => {
    if (row.hasEntry) previousRank.set(row.technicianId, index + 1)
  })

  sortLeaderboardRows(current).forEach((row, index) => {
    const before = previousRank.get(row.technicianId)
    movement.set(row.technicianId, before === undefined ? null : before - (index + 1))
  })

  return movement
}

/**
 * Sales gap to the person directly above. "$460 behind Zed" is a target you can hit by
 * Friday; "2nd place" is just a label.
 */
export function getGapAbove(sorted: LeaderboardRow[], index: number): number {
  if (index <= 0) return 0
  return Math.max(0, sorted[index - 1].salesAmount - sorted[index].salesAmount)
}

/** How far the leader is clear of second place. Zero when nobody is chasing. */
export function getLeaderMargin(sorted: LeaderboardRow[]): number {
  if (sorted.length < 2) return 0
  return Math.max(0, sorted[0].salesAmount - sorted[1].salesAmount)
}

const REVEAL_SEEN_KEY = 'leaderboard-reveal-seen'

/**
 * The reveal is an event, not wallpaper — it plays once per week per device. Kept in
 * localStorage rather than a table on purpose: seeing it twice across two devices is
 * harmless, and it is not worth a schema, a write on every page view, or a round trip
 * before the animation can start.
 */
export function hasSeenReveal(weekKey: string): boolean {
  try {
    return localStorage.getItem(REVEAL_SEEN_KEY) === weekKey
  } catch {
    return false
  }
}

export function markRevealSeen(weekKey: string): void {
  try {
    localStorage.setItem(REVEAL_SEEN_KEY, weekKey)
  } catch {
    /* private mode — the reveal simply plays again next visit */
  }
}

// ── I/O ───────────────────────────────────────────────────────────────────────

export async function fetchWeekEntries(
  orgId: string,
  weekStart: Date
): Promise<WeeklyLeaderboardEntryRow[]> {
  const { data, error } = await supabase
    .from('weekly_leaderboard_entries')
    .select('*')
    .eq('org_id', orgId)
    .eq('week_start', toDateKey(weekStart))

  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * One upsert for the whole week. The `(org_id, technician_id, week_start)` unique key
 * makes this idempotent, so a retry after a flaky save cannot double-count anything.
 */
export async function saveWeekEntries(input: {
  orgId: string
  weekStart: Date
  editorId: string
  changed: DraftDiffResult['changed']
}): Promise<void> {
  if (input.changed.length === 0) return

  const weekKey = toDateKey(input.weekStart)
  const payload: WeeklyLeaderboardEntryInsert[] = input.changed.map((row) => ({
    org_id: input.orgId,
    technician_id: row.technicianId,
    week_start: weekKey,
    jobs_completed: row.jobsCompleted,
    sales_amount: row.salesAmount,
    created_by: input.editorId,
    updated_by: input.editorId,
  }))

  const { error } = await supabase
    .from('weekly_leaderboard_entries')
    .upsert(payload, { onConflict: 'org_id,technician_id,week_start' })

  if (error) throw new Error(error.message)
}
