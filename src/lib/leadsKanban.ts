export const BOOKING_CANCELLED_STATUS = 'booking_cancelled' as const
const HIDEABLE_CLOSED_STATUSES = new Set(['lost', 'completed'])

export const TEAM_KANBAN_COLUMNS = [
  { key: 'unassigned', label: 'Unassigned', color: 'border-gray-300', badge: 'bg-gray-100 text-gray-600' },
  { key: 'assigned', label: 'Assigned', color: 'border-violet-300', badge: 'bg-violet-100 text-violet-700' },
  { key: 'contact_attempted', label: 'Contact Attempted', color: 'border-amber-300', badge: 'bg-amber-100 text-amber-700' },
  { key: 'booked', label: 'Booked', color: 'border-indigo-300', badge: 'bg-indigo-100 text-indigo-700' },
  { key: 'booking_cancelled', label: 'Booking Cancelled', color: 'border-red-400', badge: 'bg-red-100 text-red-700' },
  { key: 'lost', label: 'Lost', color: 'border-red-300', badge: 'bg-red-100 text-red-600' },
  { key: 'completed', label: 'Completed', color: 'border-purple-300', badge: 'bg-purple-100 text-purple-700' },
] as const

export const SOLO_KANBAN_COLUMNS = [
  { key: 'assigned', label: 'Inbox', color: 'border-violet-300', badge: 'bg-violet-100 text-violet-700' },
  { key: 'contact_attempted', label: 'In progress', color: 'border-amber-300', badge: 'bg-amber-100 text-amber-700' },
  { key: 'booked', label: 'Booked', color: 'border-indigo-300', badge: 'bg-indigo-100 text-indigo-700' },
  { key: 'booking_cancelled', label: 'Cancelled', color: 'border-red-400', badge: 'bg-red-100 text-red-700' },
  { key: 'lost', label: 'Lost', color: 'border-red-300', badge: 'bg-red-100 text-red-600' },
  { key: 'completed', label: 'Done', color: 'border-purple-300', badge: 'bg-purple-100 text-purple-700' },
] as const

export type KanbanColumnDef =
  | (typeof TEAM_KANBAN_COLUMNS)[number]
  | (typeof SOLO_KANBAN_COLUMNS)[number]

export const TEAM_MOBILE_TABS = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'contact', label: 'Contacted' },
  { key: 'closed', label: 'Done / Lost' },
] as const

export const SOLO_MOBILE_TABS = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'active', label: 'Active' },
  { key: 'done', label: 'Done' },
] as const

export type TeamMobileTab = (typeof TEAM_MOBILE_TABS)[number]['key']
export type SoloMobileTab = (typeof SOLO_MOBILE_TABS)[number]['key']
export type LeadsMobileTab = TeamMobileTab | SoloMobileTab

export function getKanbanColumns(isSolo: boolean): readonly KanbanColumnDef[] {
  return isSolo ? SOLO_KANBAN_COLUMNS : TEAM_KANBAN_COLUMNS
}

export function getMobileTabs(isSolo: boolean) {
  return isSolo ? SOLO_MOBILE_TABS : TEAM_MOBILE_TABS
}

export function getDefaultMobileTab(isSolo: boolean): LeadsMobileTab {
  return isSolo ? 'inbox' : 'unassigned'
}

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

export function getColumnsForTab(tab: string, isSolo = false): string[] {
  if (isSolo) {
    if (tab === 'inbox') return ['assigned']
    if (tab === 'active') return ['contact_attempted', 'booked', BOOKING_CANCELLED_STATUS]
    if (tab === 'done') return ['lost', 'completed']
    return []
  }
  if (tab === 'unassigned') return ['unassigned']
  if (tab === 'assigned') return ['assigned']
  if (tab === 'contact') return ['contact_attempted', 'booked', BOOKING_CANCELLED_STATUS]
  if (tab === 'closed') return ['lost', 'completed']
  return []
}

export type MobileLeadsTab = LeadsMobileTab

export function mobileTabForStatus(status: string, isSolo = false): LeadsMobileTab {
  if (isSolo) {
    if (status === 'assigned') return 'inbox'
    if (status === 'contact_attempted' || status === 'booked' || status === BOOKING_CANCELLED_STATUS) {
      return 'active'
    }
    return 'done'
  }
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
