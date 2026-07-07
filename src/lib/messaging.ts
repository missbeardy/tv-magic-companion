// Types + helpers for internal support messaging.

export interface SupportMessage {
  id: string
  org_id: string
  user_id: string   // thread owner
  sender_id: string // who wrote it
  body: string
  created_at: string
  _failed?: boolean // client-only: insert failed, offer retry
}

export interface Announcement {
  id: string
  sender_id: string
  body: string
  created_at: string
}

export function byCreatedAsc(a: { created_at: string }, b: { created_at: string }): number {
  return a.created_at.localeCompare(b.created_at)
}

/** "Today" / "Yesterday" / "8 Jul 2026" for day-group dividers. */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function dayKey(iso: string): string {
  return new Date(iso).toDateString()
}
