/** Kanban status path derived from lead_events — shared by platform trace UI. */

export const KANBAN_TRACE_STATUSES = [
  'unassigned',
  'assigned',
  'contact_attempted',
  'booked',
  'booking_cancelled',
  'lost',
  'completed',
] as const

export type KanbanTraceStatus = (typeof KANBAN_TRACE_STATUSES)[number]

const KANBAN_STATUS_SET = new Set<string>(KANBAN_TRACE_STATUSES)

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

export interface LeadEventRow {
  id: string
  lead_id: string
  event_type: string
  payload: Record<string, unknown> | null
  note: string | null
  created_at: string
  created_by?: string | null
}

export interface KanbanPathNode {
  nodeId: string
  status: string
  label: string
  event: LeadEventRow | null
  isCurrent: boolean
}

const EVENT_STATUS_MAP: Record<string, string> = {
  created: 'unassigned',
  assigned: 'assigned',
  contact_attempted: 'contact_attempted',
  booked: 'booked',
  booking_cancelled: 'booking_cancelled',
  completed: 'completed',
  lost: 'lost',
  expired: 'unassigned',
  unassigned: 'unassigned',
}

function payloadToStatus(payload: Record<string, unknown> | null): string | null {
  const to = payload?.to_status
  if (typeof to === 'string' && KANBAN_STATUS_SET.has(to)) return to
  if (typeof to === 'string' && to === 'expired') return 'unassigned'
  return null
}

/** Resolve kanban column for a single lead event, or null if not a status transition. */
export function statusFromLeadEvent(event: LeadEventRow): string | null {
  const fromPayload = payloadToStatus(event.payload)
  if (fromPayload) return fromPayload
  return EVENT_STATUS_MAP[event.event_type] ?? null
}

function kanbanLabel(status: string): string {
  return LEAD_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

/** Build deduped actual-path nodes from chronological lead_events + current lead status. */
export function buildKanbanPathFromEvents(
  events: LeadEventRow[],
  currentStatus: string | null
): KanbanPathNode[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const path: KanbanPathNode[] = []
  let lastStatus: string | null = null
  let index = 0

  for (const event of sorted) {
    const status = statusFromLeadEvent(event)
    if (!status || status === lastStatus) continue

    path.push({
      nodeId: `kanban:${index}:${status}`,
      status,
      label: kanbanLabel(status),
      event,
      isCurrent: false,
    })
    lastStatus = status
    index += 1
  }

  const resolvedCurrent =
    currentStatus && (KANBAN_STATUS_SET.has(currentStatus) || currentStatus === 'expired')
      ? currentStatus === 'expired'
        ? 'unassigned'
        : currentStatus
      : null

  if (resolvedCurrent) {
    if (lastStatus !== resolvedCurrent) {
      path.push({
        nodeId: `kanban:${index}:${resolvedCurrent}`,
        status: resolvedCurrent,
        label: kanbanLabel(resolvedCurrent),
        event: null,
        isCurrent: true,
      })
    } else if (path.length > 0) {
      path[path.length - 1].isCurrent = true
    } else {
      path.push({
        nodeId: `kanban:0:${resolvedCurrent}`,
        status: resolvedCurrent,
        label: kanbanLabel(resolvedCurrent),
        event: null,
        isCurrent: true,
      })
    }
  } else if (path.length > 0) {
    path[path.length - 1].isCurrent = true
  }

  return path
}
