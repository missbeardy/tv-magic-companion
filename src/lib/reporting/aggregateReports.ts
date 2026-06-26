import type {
  AgentActivity,
  AgentProfileRow,
  ConversionMetric,
  LeadEventRow,
  LeadRow,
  ReportingAggregateResult,
  SourceBreakdownRow,
  TeamSummary,
} from './types'

const CONTACT_EVENT_TYPES = new Set(['call_attempted', 'sms_attempted', 'contact_attempted'])
const OUTCOME_TYPES = new Set(['completed', 'lost', 'expired', 'booking_cancelled'])

function getPayloadValue(payload: Record<string, unknown> | null, key: string): string | null {
  if (!payload) return null
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getActorId(event: LeadEventRow): string | null {
  if (event.actor_id) return event.actor_id
  if (event.created_by) return event.created_by
  return null
}

function createEmptySummary(): TeamSummary {
  return {
    leadsReceived: 0,
    assignments: 0,
    unassigned: 0,
    contactAttempts: 0,
    bookings: 0,
    completed: 0,
    lost: 0,
    expired: 0,
    bookingCancelled: 0,
    reviewRequests: 0,
  }
}

function createConversionMetric(numerator: number, denominator: number): ConversionMetric {
  return {
    numerator,
    denominator,
    rate: denominator > 0 ? numerator / denominator : null,
  }
}

function normalizeLeadSource(lead: LeadRow): string {
  const preferred = lead.lead_source?.trim()
  if (preferred) return preferred
  const fallback = lead.source?.trim()
  if (fallback) return fallback
  return 'Unknown'
}

function getOutcomeType(event: LeadEventRow): 'completed' | 'lost' | 'expired' | 'booking_cancelled' | null {
  if (OUTCOME_TYPES.has(event.event_type)) {
    return event.event_type as 'completed' | 'lost' | 'expired' | 'booking_cancelled'
  }
  if (event.event_type !== 'status_change') return null

  const toStatus = getPayloadValue(event.payload, 'to_status')
  if (toStatus && OUTCOME_TYPES.has(toStatus)) {
    return toStatus as 'completed' | 'lost' | 'expired' | 'booking_cancelled'
  }

  return null
}

function isContactEvent(event: LeadEventRow): boolean {
  if (CONTACT_EVENT_TYPES.has(event.event_type)) return true
  if (event.event_type !== 'status_change') return false
  return getPayloadValue(event.payload, 'to_status') === 'contact_attempted'
}

function isBookingEvent(event: LeadEventRow): boolean {
  if (event.event_type === 'booked') return true
  if (event.event_type !== 'status_change') return false
  return getPayloadValue(event.payload, 'to_status') === 'booked'
}

function resolveCreditAgentId(
  event: LeadEventRow,
  monthAssigneeByLead: Map<string, string>,
  actorId: string | null
): string | null {
  return monthAssigneeByLead.get(event.lead_id) ?? actorId
}

export function aggregateReportingData(
  events: LeadEventRow[],
  leads: LeadRow[],
  profiles: AgentProfileRow[]
): ReportingAggregateResult {
  const summary = createEmptySummary()
  const sourceMap = new Map<string, number>()

  const agentMap = new Map<string, AgentActivity>()
  const ensureAgent = (agentId: string, fallbackName?: string, fallbackRole?: AgentProfileRow['role']) => {
    const existing = agentMap.get(agentId)
    if (existing) return existing

    const profile = profiles.find((p) => p.id === agentId)
    const row: AgentActivity = {
      ...createEmptySummary(),
      agentId,
      name: profile?.full_name || fallbackName || 'Unknown user',
      role: profile?.role || fallbackRole || 'employee',
    }
    agentMap.set(agentId, row)
    return row
  }

  for (const profile of profiles) {
    ensureAgent(profile.id, profile.full_name, profile.role)
  }

  for (const lead of leads) {
    summary.leadsReceived += 1
    const source = normalizeLeadSource(lead)
    sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1)
  }

  const assignedLeadIds = new Set<string>()
  const contactedLeadIds = new Set<string>()
  const bookedLeadIds = new Set<string>()
  const completedLeadIds = new Set<string>()

  const completedOutcomes = new Set<string>()
  const lostOutcomes = new Set<string>()
  const expiredOutcomes = new Set<string>()
  const cancelledOutcomes = new Set<string>()
  const completedByActor = new Set<string>()
  const lostByActor = new Set<string>()
  const expiredByActor = new Set<string>()
  const cancelledByActor = new Set<string>()

  const firstAssignedAtByLead = new Map<string, number>()
  const monthAssigneeByLead = new Map<string, string>()
  const measuredContactLeadIds = new Set<string>()
  const measuredBookingLeadIds = new Set<string>()
  const hoursToFirstContact: number[] = []
  const hoursToBooking: number[] = []

  const sortedEvents = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))

  for (const event of sortedEvents) {
    const actorId = getActorId(event)
    const eventTimeMs = Date.parse(event.created_at)

    if (event.event_type === 'assigned') {
      summary.assignments += 1
      assignedLeadIds.add(event.lead_id)

      if (!Number.isNaN(eventTimeMs) && !firstAssignedAtByLead.has(event.lead_id)) {
        firstAssignedAtByLead.set(event.lead_id, eventTimeMs)
      }

      const assigneeId = getPayloadValue(event.payload, 'assigned_to') || actorId
      if (assigneeId) {
        monthAssigneeByLead.set(event.lead_id, assigneeId)
        const assignee = ensureAgent(assigneeId)
        assignee.assignments += 1
      }
    }

    if (event.event_type === 'unassigned') {
      summary.unassigned += 1
      monthAssigneeByLead.delete(event.lead_id)
      if (actorId) {
        const actor = ensureAgent(actorId)
        actor.unassigned += 1
      }
    }

    const creditId = resolveCreditAgentId(event, monthAssigneeByLead, actorId)

    if (isContactEvent(event)) {
      summary.contactAttempts += 1
      if (creditId) {
        const agent = ensureAgent(creditId)
        agent.contactAttempts += 1
      }
      if (assignedLeadIds.has(event.lead_id)) {
        contactedLeadIds.add(event.lead_id)
      }

      const assignedAt = firstAssignedAtByLead.get(event.lead_id)
      if (!measuredContactLeadIds.has(event.lead_id) && assignedAt && !Number.isNaN(eventTimeMs) && eventTimeMs >= assignedAt) {
        measuredContactLeadIds.add(event.lead_id)
        hoursToFirstContact.push((eventTimeMs - assignedAt) / 36e5)
      }
    }

    if (isBookingEvent(event)) {
      summary.bookings += 1
      bookedLeadIds.add(event.lead_id)
      if (creditId) {
        const agent = ensureAgent(creditId)
        agent.bookings += 1
      }

      const assignedAt = firstAssignedAtByLead.get(event.lead_id)
      if (!measuredBookingLeadIds.has(event.lead_id) && assignedAt && !Number.isNaN(eventTimeMs) && eventTimeMs >= assignedAt) {
        measuredBookingLeadIds.add(event.lead_id)
        hoursToBooking.push((eventTimeMs - assignedAt) / 36e5)
      }
    }

    if (event.event_type === 'review_request') {
      summary.reviewRequests += 1
      if (creditId) {
        const agent = ensureAgent(creditId)
        agent.reviewRequests += 1
      }
    }

    const outcome = getOutcomeType(event)
    if (outcome) {
      if (creditId) {
        const agent = ensureAgent(creditId)
        const agentOutcomeKey = `${creditId}:${event.lead_id}`
        if (outcome === 'completed' && !completedByActor.has(agentOutcomeKey)) {
          completedByActor.add(agentOutcomeKey)
          agent.completed += 1
        }
        if (outcome === 'lost' && !lostByActor.has(agentOutcomeKey)) {
          lostByActor.add(agentOutcomeKey)
          agent.lost += 1
        }
        if (outcome === 'expired' && !expiredByActor.has(agentOutcomeKey)) {
          expiredByActor.add(agentOutcomeKey)
          agent.expired += 1
        }
        if (outcome === 'booking_cancelled' && !cancelledByActor.has(agentOutcomeKey)) {
          cancelledByActor.add(agentOutcomeKey)
          agent.bookingCancelled += 1
        }
      }

      if (outcome === 'completed') {
        completedLeadIds.add(event.lead_id)
        if (!completedOutcomes.has(event.lead_id)) {
          completedOutcomes.add(event.lead_id)
          summary.completed += 1
        }
      }

      if (outcome === 'lost' && !lostOutcomes.has(event.lead_id)) {
        lostOutcomes.add(event.lead_id)
        summary.lost += 1
      }

      if (outcome === 'expired' && !expiredOutcomes.has(event.lead_id)) {
        expiredOutcomes.add(event.lead_id)
        summary.expired += 1
      }

      if (outcome === 'booking_cancelled' && !cancelledOutcomes.has(event.lead_id)) {
        cancelledOutcomes.add(event.lead_id)
        summary.bookingCancelled += 1
      }
    }
  }

  const assignedAndContacted = [...assignedLeadIds].filter((leadId) => contactedLeadIds.has(leadId))
  const contactedAndBooked = assignedAndContacted.filter((leadId) => bookedLeadIds.has(leadId))
  const bookedAndCompleted = [...bookedLeadIds].filter((leadId) => completedLeadIds.has(leadId))

  const sourceBreakdown: SourceBreakdownRow[] = [...sourceMap.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))

  const avg = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null)

  return {
    summary,
    agentRows: [...agentMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    sourceBreakdown,
    conversions: {
      assignedToContacted: createConversionMetric(assignedAndContacted.length, assignedLeadIds.size),
      contactedToBooked: createConversionMetric(contactedAndBooked.length, assignedAndContacted.length),
      bookedToCompleted: createConversionMetric(bookedAndCompleted.length, bookedLeadIds.size),
    },
    timing: {
      avgHoursToFirstContact: avg(hoursToFirstContact),
      avgHoursToBooking: avg(hoursToBooking),
      firstContactSamples: hoursToFirstContact.length,
      bookingSamples: hoursToBooking.length,
    },
  }
}
