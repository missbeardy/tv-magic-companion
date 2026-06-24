export interface ReportPeriod {
  monthStart: Date
  monthEnd: Date
  startIso: string
  endIso: string
  monthKey: string
  label: string
}

export interface LeadEventRow {
  lead_id: string
  event_type: string
  created_at: string
  created_by: string | null
  actor_id: string | null
  payload: Record<string, unknown> | null
}

export interface LeadRow {
  id: string
  source: string | null
  lead_source: string | null
  status: string
  created_at: string
  assigned_to: string | null
}

export interface AgentProfileRow {
  id: string
  full_name: string
  role: 'manager' | 'employee' | 'platform_admin'
}

export interface TeamSummary {
  leadsReceived: number
  assignments: number
  unassigned: number
  contactAttempts: number
  bookings: number
  completed: number
  lost: number
  expired: number
  bookingCancelled: number
  reviewRequests: number
}

export interface AgentActivity extends TeamSummary {
  agentId: string
  name: string
  role: AgentProfileRow['role']
}

export interface ConversionMetric {
  numerator: number
  denominator: number
  rate: number | null
}

export interface ConversionSummary {
  assignedToContacted: ConversionMetric
  contactedToBooked: ConversionMetric
  bookedToCompleted: ConversionMetric
}

export interface TimingSummary {
  avgHoursToFirstContact: number | null
  avgHoursToBooking: number | null
  firstContactSamples: number
  bookingSamples: number
}

export interface SourceBreakdownRow {
  source: string
  count: number
}

export interface ReportingAggregateResult {
  summary: TeamSummary
  agentRows: AgentActivity[]
  sourceBreakdown: SourceBreakdownRow[]
  conversions: ConversionSummary
  timing: TimingSummary
}
