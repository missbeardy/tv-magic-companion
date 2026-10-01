/**
 * Overdue bookings (T1.21). A lead left in `booked` after its calendar booking has finished is
 * a job nobody closed out — completed, lost or rescheduled. The board flags it and the
 * automation-sweeps cron nudges the assignee (and digests managers) until the status moves.
 */

const MS_PER_HOUR = 3_600_000

/** A booking counts as overdue this long after its end time — room to finish the job and update. */
export const BOOKING_OVERDUE_GRACE_MS = 2 * MS_PER_HOUR

/**
 * Minimum gap between nudges to the same person (employee or manager). 20h rather than
 * 24h so an hourly cron that first fires at 8am keeps landing at 8am instead of drifting later.
 */
export const BOOKING_OVERDUE_NUDGE_COOLDOWN_MS = 20 * MS_PER_HOUR

export interface BookingWindow {
  id?: string
  lead_id: string | null
  start_time: string
  end_time: string
}

export interface LeadBooking {
  eventId: string | null
  start: string
  end: string
}

/**
 * The latest booking per lead. A lead can carry more than one event (a reschedule creates a new
 * one, a multi-visit job has several), and it is only overdue once the last of them has passed.
 */
export function latestBookingByLead(events: BookingWindow[]): Map<string, LeadBooking> {
  const byLead = new Map<string, LeadBooking>()
  for (const ev of events) {
    if (!ev.lead_id) continue
    const current = byLead.get(ev.lead_id)
    if (!current || new Date(ev.end_time).getTime() > new Date(current.end).getTime()) {
      byLead.set(ev.lead_id, { eventId: ev.id ?? null, start: ev.start_time, end: ev.end_time })
    }
  }
  return byLead
}

export function isBookingOverdue(
  status: string,
  bookingEnd: string | null | undefined,
  nowMs = Date.now()
): boolean {
  if (status !== 'booked' || !bookingEnd) return false
  const endMs = new Date(bookingEnd).getTime()
  if (!Number.isFinite(endMs)) return false
  return nowMs - endMs >= BOOKING_OVERDUE_GRACE_MS
}

/** Whole days since the booking ended, floored, minimum 0. */
export function daysSinceBooking(bookingEnd: string, nowMs = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - new Date(bookingEnd).getTime()) / (24 * MS_PER_HOUR)))
}

export function formatBookingWhen(iso: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export const BOOKING_NUDGE_TITLES = {
  employeeSingle: 'Booking passed — update the job',
  employeeMany: 'Your bookings need updating',
  manager: 'Team bookings need updating',
} as const

/** Titles that mark an employee nudge as already sent — the cron dedupes on these. */
export const EMPLOYEE_NUDGE_TITLES: string[] = [
  BOOKING_NUDGE_TITLES.employeeSingle,
  BOOKING_NUDGE_TITLES.employeeMany,
]

export interface OverdueLeadSummary {
  id: string
  name: string | null
  start: string
}

/**
 * One notification per employee per day, however many jobs they have overdue: a backlog of
 * 55 must not become 55 pushes. A single job is named and deep-linked; several point at the board.
 */
export function buildEmployeeBookingNudge(
  leads: OverdueLeadSummary[],
  timeZone?: string
): { title: string; message: string; url: string; leadId?: string } {
  const oldest = [...leads].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0]
  const name = oldest.name?.trim() || 'A customer'
  const when = formatBookingWhen(oldest.start, timeZone)
  if (leads.length === 1) {
    return {
      title: BOOKING_NUDGE_TITLES.employeeSingle,
      message: `${name} was booked for ${when}. Mark it completed, lost or reschedule it.`,
      url: `/leads?lead=${oldest.id}`,
      leadId: oldest.id,
    }
  }
  return {
    title: BOOKING_NUDGE_TITLES.employeeMany,
    message: `${leads.length} of your booked jobs have passed (oldest: ${name}, ${when}). Mark each completed, lost or reschedule it.`,
    url: '/leads',
  }
}

export function buildManagerBookingDigest(count: number): { title: string; message: string } {
  const jobs = count === 1 ? '1 booked job has' : `${count} booked jobs have`
  return {
    title: BOOKING_NUDGE_TITLES.manager,
    message: `${jobs} passed without being marked completed, lost or rescheduled. Check the Booked column.`,
  }
}
