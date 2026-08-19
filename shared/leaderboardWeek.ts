/**
 * Server-side week maths for the leaderboard nudge. No Vite/env imports.
 *
 * Why this exists separately from `src/lib/leaderboard.ts`: the browser deliberately
 * computes the week from the *device's* local time, so a technician always sees the week
 * they are living in. The cron has no device — it must anchor to the business timezone,
 * or a job running at 06:00 UTC would decide it is still last week and nudge about a
 * board nobody has filled in yet. For an Australian franchise the two agree; this module
 * makes the server's assumption explicit rather than accidental.
 */

/** The business timezone. Everything the cron decides is in this zone. */
export const BUSINESS_TIME_ZONE = 'Australia/Sydney'

export interface BusinessNow {
  year: number
  month: number
  day: number
  hour: number
  /** 1 = Monday … 7 = Sunday, matching Postgres ISODOW. */
  isoWeekday: number
}

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

/** Read the wall clock in the business timezone, DST included. */
export function getBusinessNow(date: Date = new Date()): BusinessNow {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date)

  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const weekday = pick('weekday').slice(0, 3)
  // en-AU renders midnight as "24" under hour12:false in some ICU versions.
  const hour = Number(pick('hour')) % 24

  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour,
    isoWeekday: WEEKDAY_TO_ISO[weekday] ?? 1,
  }
}

/**
 * `YYYY-MM-DD` of the Monday that starts the current business week — the exact value
 * `weekly_leaderboard_entries.week_start` stores.
 */
export function getBusinessWeekStartKey(date: Date = new Date()): string {
  const now = getBusinessNow(date)
  // Build a UTC-noon date from the business calendar day so the day arithmetic below
  // cannot slip across a boundary on the host's own timezone.
  const anchor = new Date(Date.UTC(now.year, now.month - 1, now.day, 12))
  anchor.setUTCDate(anchor.getUTCDate() - (now.isoWeekday - 1))

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${anchor.getUTCFullYear()}-${pad(anchor.getUTCMonth() + 1)}-${pad(anchor.getUTCDate())}`
}

/** Saturday 17:00 business time — "post this week's results" goes to managers. */
export const REMIND_ISO_WEEKDAY = 6
export const REMIND_HOUR = 17

/** Monday 08:00 business time — "last week's results are in" goes to the team. */
export const REVEAL_ISO_WEEKDAY = 1
export const REVEAL_HOUR = 8

export type NudgePhase = 'remind' | 'reveal'

/**
 * Which week each phase is actually about. They are not the same week, and that is the
 * whole reason this helper exists rather than every caller reaching for "now".
 *
 * - `remind` runs on Saturday, inside the week being scored — the current week.
 * - `reveal` runs on Monday morning, which is already the *next* week. The week it
 *   celebrates is the one that closed the night before, so it steps back seven days.
 *   Reading the current week here would announce results for a week nobody has worked yet.
 */
export function getNudgeWeekStartKey(phase: NudgePhase, date: Date = new Date()): string {
  const currentWeek = getBusinessWeekStartKey(date)
  if (phase === 'remind') return currentWeek

  const [year, month, day] = currentWeek.split('-').map(Number)
  const previous = new Date(Date.UTC(year, month - 1, day, 12))
  previous.setUTCDate(previous.getUTCDate() - 7)

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${previous.getUTCFullYear()}-${pad(previous.getUTCMonth() + 1)}-${pad(previous.getUTCDate())}`
}

/**
 * Is *now* the moment this phase is meant to fire?
 *
 * GitHub Actions schedules in UTC only, so each phase is scheduled at both UTC hours
 * that its business hour can land on across daylight saving, and this guard picks the
 * right one. Note the Monday reveal is scheduled on a *Sunday* in UTC. Firing twice is harmless anyway — the per-week dedupe check stops a second
 * send — but this keeps the notification landing at the hour it was designed for
 * instead of an hour early for half the year.
 */
export function isNudgeWindow(phase: NudgePhase, date: Date = new Date()): boolean {
  const now = getBusinessNow(date)
  if (phase === 'remind') {
    return now.isoWeekday === REMIND_ISO_WEEKDAY && now.hour === REMIND_HOUR
  }
  return now.isoWeekday === REVEAL_ISO_WEEKDAY && now.hour === REVEAL_HOUR
}
