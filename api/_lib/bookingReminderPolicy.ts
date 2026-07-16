const MS_PER_HOUR = 3_600_000

/** Reminder send window: [start+20h, start+28h] before the booking. */
export const REMINDER_WINDOW_MIN_HOURS = 20
export const REMINDER_WINDOW_MAX_HOURS = 28

export const QUIET_HOURS_START = 8
export const QUIET_HOURS_END = 20

/** True when the booking's start time falls in the day-before send window and no reminder has gone out yet. */
export function isReminderDue(startTime: Date, now: Date, reminderSentAt: Date | null): boolean {
  if (reminderSentAt) return false
  const hoursUntilStart = (startTime.getTime() - now.getTime()) / MS_PER_HOUR
  return hoursUntilStart >= REMINDER_WINDOW_MIN_HOURS && hoursUntilStart <= REMINDER_WINDOW_MAX_HOURS
}

/** True when `now`, rendered in `timezone`, falls within the 8am-8pm local send window. */
export function isWithinQuietHours(now: Date, timezone: string): boolean {
  let hour: number
  try {
    const formatted = new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now)
    hour = Number(formatted)
  } catch {
    // Unknown/invalid timezone — fail open rather than silently never sending.
    return true
  }
  if (!Number.isFinite(hour)) return true
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END
}

const LOST_LEAD_STATUSES = new Set(['lost', 'booking_cancelled'])

/** True when the linked lead's status means the booking is no longer going ahead. */
export function isBookingCancelled(leadStatus: string | null | undefined): boolean {
  return Boolean(leadStatus && LOST_LEAD_STATUSES.has(leadStatus))
}
