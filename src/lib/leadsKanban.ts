export const BOOKING_CANCELLED_STATUS = 'booking_cancelled' as const
const HIDEABLE_CLOSED_STATUSES = new Set(['lost', 'completed'])

export const LEAD_STATUS_LABELS: Record<string, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  contact_attempted: 'Contact Attempted',
  booked: 'Booked',
  booking_cancelled: 'Booking Cancelled',
  lost: 'Lost',
  completed: 'Completed',
  expired: 'Expired',
}

export function getColumnsForTab(tab: string): string[] {
  if (tab === 'unassigned') return ['unassigned']
  if (tab === 'assigned') return ['assigned']
  if (tab === 'contact') return ['contact_attempted', 'booked', BOOKING_CANCELLED_STATUS]
  if (tab === 'closed') return ['lost', 'completed']
  return []
}

export type MobileLeadsTab = 'unassigned' | 'assigned' | 'contact' | 'closed'

export function mobileTabForStatus(status: string): MobileLeadsTab {
  if (status === 'unassigned') return 'unassigned'
  if (status === 'assigned') return 'assigned'
  if (status === 'contact_attempted' || status === 'booked' || status === BOOKING_CANCELLED_STATUS) {
    return 'contact'
  }
  return 'closed'
}

export function isLeadVisibleInActiveKanban(status: string, hiddenFromKanbanAt?: string | null): boolean {
  if (!hiddenFromKanbanAt) return true
  return !HIDEABLE_CLOSED_STATUSES.has(status)
}
