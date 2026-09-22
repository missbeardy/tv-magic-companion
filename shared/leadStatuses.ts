/** Every value `leads.status` can hold — the leads-board Kanban columns (see
 * src/lib/leadsKanban.ts) are the authoritative source this was pulled from. */
export const LEAD_STATUSES = [
  'unassigned',
  'assigned',
  'contact_attempted',
  'booked',
  'booking_cancelled',
  'lost',
  'completed',
  'expired',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]
