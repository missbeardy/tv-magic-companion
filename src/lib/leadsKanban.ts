export const BOOKING_CANCELLED_STATUS = 'booking_cancelled' as const

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
