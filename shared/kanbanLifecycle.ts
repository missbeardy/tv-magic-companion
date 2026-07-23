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
  actor_id?: string | null
}

export type KanbanAttributionMode = 'automated' | 'manual' | 'initial' | 'unknown'

export interface KanbanAttribution {
  mode: KanbanAttributionMode
  /** Full detail summary, e.g. "Automated · assigned to Jane" */
  summary: string
  /** Short node subtitle, e.g. "Auto", "by Jane", "Initial" */
  subtitle: string
  actorLabel: string | null
  assigneeLabel: string | null
  source: string | null
  sourceLabel: string | null
}

export interface KanbanPathNode {
  nodeId: string
  status: string
  label: string
  event: LeadEventRow | null
  isCurrent: boolean
  attribution?: KanbanAttribution | null
}

const AUTOMATED_SOURCES = new Set(['inbound_auto_assign', 'assign_timer'])

const SOURCE_LABELS: Record<string, string> = {
  inbound_auto_assign: 'inbound auto-assign',
  assign_timer: 'assign timer',
  manager_assign: 'manager assign',
  self_assign: 'self-assign',
  status_menu: 'status menu',
  drag: 'drag',
  call_auto_assign: 'call pickup',
  sms_auto_assign: 'SMS pickup',
  calendar_booking: 'calendar booking',
  offline_queue: 'offline queue',
}

function payloadString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function resolveActorId(event: LeadEventRow): string | null {
  return event.actor_id ?? event.created_by ?? null
}

function humanizeSource(source: string | null): string | null {
  if (!source) return null
  return SOURCE_LABELS[source] ?? source.replace(/_/g, ' ')
}

function nameFor(id: string | null, nameById: Map<string, string>): string | null {
  if (!id) return null
  const name = nameById.get(id)?.trim()
  return name || null
}

/** Collect profile IDs referenced by lead events for name lookup. */
export function collectKanbanProfileIds(events: LeadEventRow[]): string[] {
  const ids = new Set<string>()
  for (const event of events) {
    const actorId = resolveActorId(event)
    if (actorId) ids.add(actorId)
    const assignedTo = payloadString(event.payload, 'assigned_to')
    if (assignedTo) ids.add(assignedTo)
    const previous = payloadString(event.payload, 'previous_assignee_id')
    if (previous) ids.add(previous)
  }
  return [...ids]
}

/**
 * Derive assign/unassign attribution from a lead event + optional profile names.
 * Only meaningful for assigned / unassigned kanban statuses.
 */
export function describeKanbanAttribution(
  event: LeadEventRow | null,
  status: string,
  nameById: Map<string, string> = new Map()
): KanbanAttribution | null {
  if (status !== 'assigned' && status !== 'unassigned') return null
  if (!event) {
    return {
      mode: 'unknown',
      summary: 'Unknown',
      subtitle: 'Unknown',
      actorLabel: null,
      assigneeLabel: null,
      source: null,
      sourceLabel: null,
    }
  }

  const source = payloadString(event.payload, 'source')
  const sourceLabel = humanizeSource(source)
  const actorId = resolveActorId(event)
  const actorName = nameFor(actorId, nameById)
  const assignedToId = payloadString(event.payload, 'assigned_to')
  const previousId = payloadString(event.payload, 'previous_assignee_id')
  const assigneeName =
    status === 'assigned'
      ? nameFor(assignedToId, nameById)
      : nameFor(previousId, nameById)

  if (event.event_type === 'created') {
    return {
      mode: 'initial',
      summary: 'Lead opened in pool',
      subtitle: 'Initial',
      actorLabel: actorName,
      assigneeLabel: null,
      source,
      sourceLabel,
    }
  }

  const isAutomated =
    event.event_type === 'expired' ||
    (source != null && AUTOMATED_SOURCES.has(source))

  if (isAutomated) {
    const reason =
      event.event_type === 'expired' || source === 'assign_timer'
        ? 'assign timer'
        : sourceLabel ?? 'automated'
    const summary =
      status === 'assigned' && assigneeName
        ? `Automated · assigned to ${assigneeName}`
        : `Automated · ${reason}`
    return {
      mode: 'automated',
      summary,
      subtitle: 'Auto',
      actorLabel: 'System',
      assigneeLabel: assigneeName,
      source: source ?? (event.event_type === 'expired' ? 'assign_timer' : null),
      sourceLabel: reason,
    }
  }

  if (actorId || actorName) {
    const by = actorName ?? 'Someone'
    let summary: string
    if (status === 'assigned') {
      summary = assigneeName ? `Manual by ${by} · to ${assigneeName}` : `Manual by ${by}`
    } else {
      summary = assigneeName ? `Manual by ${by} (prev: ${assigneeName})` : `Manual by ${by}`
    }
    return {
      mode: 'manual',
      summary,
      subtitle: `by ${by}`,
      actorLabel: by,
      assigneeLabel: assigneeName,
      source,
      sourceLabel,
    }
  }

  const note = event.note?.trim() || null
  if (note) {
    return {
      mode: 'unknown',
      summary: note,
      subtitle: sourceLabel ?? 'Unknown',
      actorLabel: null,
      assigneeLabel: assigneeName,
      source,
      sourceLabel,
    }
  }

  if (sourceLabel) {
    return {
      mode: 'unknown',
      summary: sourceLabel,
      subtitle: sourceLabel,
      actorLabel: null,
      assigneeLabel: assigneeName,
      source,
      sourceLabel,
    }
  }

  return {
    mode: 'unknown',
    summary: 'Unknown',
    subtitle: 'Unknown',
    actorLabel: null,
    assigneeLabel: assigneeName,
    source,
    sourceLabel,
  }
}

/** Attach attribution to assigned/unassigned path nodes using a profile name map. */
export function enrichKanbanPathAttribution(
  path: KanbanPathNode[],
  nameById: Map<string, string>
): KanbanPathNode[] {
  return path.map((node) => {
    if (node.status !== 'assigned' && node.status !== 'unassigned') {
      return { ...node, attribution: null }
    }
    return {
      ...node,
      attribution: describeKanbanAttribution(node.event, node.status, nameById),
    }
  })
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
