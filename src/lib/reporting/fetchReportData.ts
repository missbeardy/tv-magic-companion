import { supabase } from '../supabase'
import { aggregateReportingData } from './aggregateReports'
import { buildReportPeriod, getMonthKey, getMonthStart } from './dateRange'
import type {
  AgentActivity,
  AgentProfileRow,
  ConversionSummary,
  LeadEventRow,
  LeadRow,
  ReportPeriod,
  ReportingAggregateResult,
  SourceBreakdownRow,
  TeamSummary,
  TimingSummary,
} from './types'

export interface ReportingResult extends ReportingAggregateResult {
  period: ReportPeriod
}

type SnapshotRow = Record<string, unknown>
type QueryError = { code?: string; message?: string } | null

const CLOSED_MONTH_SNAPSHOT_DEPENDENCY_ERROR =
  'Monthly snapshot tables are not available yet. Apply the Phase 3 reporting migration first.'
const CLOSED_MONTH_SNAPSHOT_MISSING_PREFIX = 'No monthly snapshot found for '

const MANAGER_ROLES: AgentProfileRow['role'][] = ['manager', 'employee', 'platform_admin']

function isMissingRelationError(error: QueryError): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  return (error.message ?? '').toLowerCase().includes('does not exist')
}

function getValue(row: SnapshotRow, keys: string[]): unknown {
  for (const key of keys) {
    if (key in row) return row[key]
  }
  return null
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = toNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function toRole(value: unknown): AgentProfileRow['role'] | null {
  if (value === 'manager' || value === 'employee' || value === 'platform_admin') {
    return value
  }
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

function createEmptyAgentActivity(agentId: string, name: string, role: AgentProfileRow['role']): AgentActivity {
  return {
    ...createEmptySummary(),
    agentId,
    name,
    role,
  }
}

function createConversionMetric(numerator: number, denominator: number) {
  return {
    numerator,
    denominator,
    rate: denominator > 0 ? numerator / denominator : null,
  }
}

function parseSourceBreakdown(rawValue: unknown): SourceBreakdownRow[] {
  let value = rawValue

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      value = null
    }
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const source = toStringValue((entry as SnapshotRow).source) ?? 'Unknown'
        const count = toNumber((entry as SnapshotRow).count)
        return { source, count }
      })
      .filter((entry): entry is SourceBreakdownRow => Boolean(entry))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([source, count]) => ({ source: source || 'Unknown', count: toNumber(count) }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
  }

  return []
}

function parseMonthStart(value: unknown): Date | null {
  const monthStart = toStringValue(value)
  if (!monthStart) return null
  const parsed = new Date(monthStart)
  if (Number.isNaN(parsed.getTime())) return null
  return getMonthStart(parsed)
}

function chooseEarliestMonth(months: Array<Date | null>): Date | null {
  const valid = months.filter((month): month is Date => month !== null)
  if (!valid.length) return null
  return valid.reduce((earliest, month) => (month < earliest ? month : earliest))
}

function getMonthRange(period: ReportPeriod): { startDate: string; endDate: string } {
  return {
    startDate: period.startIso.slice(0, 10),
    endDate: period.endIso.slice(0, 10),
  }
}

export async function fetchFirstLeadEventMonth(orgId: string): Promise<Date | null> {
  const [{ data: firstEvent, error: firstEventError }, { data: firstSnapshot, error: firstSnapshotError }] = await Promise.all([
    supabase
      .from('lead_events')
      .select('created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('monthly_org_reports')
      .select('month_start')
      .eq('org_id', orgId)
      .order('month_start', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (firstEventError) throw firstEventError
  if (firstSnapshotError && !isMissingRelationError(firstSnapshotError)) throw firstSnapshotError

  const firstEventMonth = parseMonthStart(firstEvent?.created_at)
  const firstSnapshotMonth = parseMonthStart(firstSnapshot?.month_start)
  return chooseEarliestMonth([firstEventMonth, firstSnapshotMonth])
}

async function fetchLeadEvents(orgId: string, period: ReportPeriod): Promise<LeadEventRow[]> {
  const { data, error } = await supabase
    .from('lead_events')
    .select('lead_id, event_type, created_at, created_by, actor_id, payload')
    .eq('org_id', orgId)
    .gte('created_at', period.startIso)
    .lt('created_at', period.endIso)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as LeadEventRow[]
}

async function fetchLeads(orgId: string, period: ReportPeriod): Promise<LeadRow[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('id, source, lead_source, status, created_at, assigned_to')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .gte('created_at', period.startIso)
    .lt('created_at', period.endIso)

  if (error) throw error
  return (data ?? []) as LeadRow[]
}

async function fetchOrgProfiles(orgId: string): Promise<AgentProfileRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('org_id', orgId)
    .in('role', MANAGER_ROLES)

  if (error) throw error
  return (data ?? []) as AgentProfileRow[]
}

async function fetchSnapshotOrgReport(orgId: string, period: ReportPeriod): Promise<SnapshotRow | null> {
  const { startDate, endDate } = getMonthRange(period)
  const { data, error } = await supabase
    .from('monthly_org_reports')
    .select('*')
    .eq('org_id', orgId)
    .gte('month_start', startDate)
    .lt('month_start', endDate)
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error(CLOSED_MONTH_SNAPSHOT_DEPENDENCY_ERROR)
    }
    throw error
  }

  return (data as SnapshotRow | null) ?? null
}

async function fetchSnapshotAgentReports(orgId: string, period: ReportPeriod): Promise<SnapshotRow[]> {
  const { startDate, endDate } = getMonthRange(period)
  const { data, error } = await supabase
    .from('monthly_agent_reports')
    .select('*')
    .eq('org_id', orgId)
    .gte('month_start', startDate)
    .lt('month_start', endDate)
    .order('agent_id', { ascending: true })

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error(CLOSED_MONTH_SNAPSHOT_DEPENDENCY_ERROR)
    }
    throw error
  }

  return (data as SnapshotRow[]) ?? []
}

function buildSummaryFromSnapshot(orgSnapshot: SnapshotRow): TeamSummary {
  return {
    leadsReceived: toNumber(getValue(orgSnapshot, ['leads_received'])),
    assignments: toNumber(getValue(orgSnapshot, ['assignments'])),
    unassigned: toNumber(getValue(orgSnapshot, ['unassigned'])),
    contactAttempts: toNumber(getValue(orgSnapshot, ['contact_attempts'])),
    bookings: toNumber(getValue(orgSnapshot, ['bookings'])),
    completed: toNumber(getValue(orgSnapshot, ['completed'])),
    lost: toNumber(getValue(orgSnapshot, ['lost'])),
    expired: toNumber(getValue(orgSnapshot, ['expired'])),
    bookingCancelled: toNumber(getValue(orgSnapshot, ['booking_cancelled'])),
    reviewRequests: toNumber(getValue(orgSnapshot, ['review_requests'])),
  }
}

function buildConversionsFromSnapshot(orgSnapshot: SnapshotRow, summary: TeamSummary): ConversionSummary {
  const assignedToContactedNumerator = toNumber(getValue(orgSnapshot, ['assigned_to_contacted_numerator']))
  const assignedToContactedDenominator = toNumber(
    getValue(orgSnapshot, ['assigned_to_contacted_denominator']),
    summary.assignments
  )

  const contactedToBookedNumerator = toNumber(getValue(orgSnapshot, ['contacted_to_booked_numerator']))
  const contactedToBookedDenominator = toNumber(
    getValue(orgSnapshot, ['contacted_to_booked_denominator']),
    assignedToContactedNumerator
  )

  const bookedToCompletedNumerator = toNumber(getValue(orgSnapshot, ['booked_to_completed_numerator']))
  const bookedToCompletedDenominator = toNumber(getValue(orgSnapshot, ['booked_to_completed_denominator']), summary.bookings)

  return {
    assignedToContacted: createConversionMetric(assignedToContactedNumerator, assignedToContactedDenominator),
    contactedToBooked: createConversionMetric(contactedToBookedNumerator, contactedToBookedDenominator),
    bookedToCompleted: createConversionMetric(bookedToCompletedNumerator, bookedToCompletedDenominator),
  }
}

function buildTimingFromSnapshot(orgSnapshot: SnapshotRow): TimingSummary {
  return {
    avgHoursToFirstContact: toNullableNumber(getValue(orgSnapshot, ['avg_hours_to_first_contact'])),
    avgHoursToBooking: toNullableNumber(getValue(orgSnapshot, ['avg_hours_to_booking'])),
    firstContactSamples: toNumber(getValue(orgSnapshot, ['first_contact_samples'])),
    bookingSamples: toNumber(getValue(orgSnapshot, ['booking_samples'])),
  }
}

function buildAgentRowsFromSnapshot(
  agentSnapshots: SnapshotRow[],
  profiles: AgentProfileRow[]
): AgentActivity[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const agentRowsById = new Map<string, AgentActivity>()

  for (const profile of profiles) {
    agentRowsById.set(profile.id, createEmptyAgentActivity(profile.id, profile.full_name, profile.role))
  }

  for (const snapshot of agentSnapshots) {
    const agentId = toStringValue(getValue(snapshot, ['agent_id', 'profile_id', 'user_id']))
    if (!agentId) continue

    const profile = profileById.get(agentId)
    const existing =
      agentRowsById.get(agentId) ?? createEmptyAgentActivity(agentId, profile?.full_name ?? 'Unknown user', profile?.role ?? 'employee')

    const snapshotRole = toRole(getValue(snapshot, ['agent_role', 'role']))
    const snapshotName = toStringValue(getValue(snapshot, ['agent_name', 'full_name', 'name']))

    agentRowsById.set(agentId, {
      ...existing,
      name: snapshotName ?? existing.name,
      role: snapshotRole ?? existing.role,
      assignments: toNumber(getValue(snapshot, ['assignments']), existing.assignments),
      unassigned: toNumber(getValue(snapshot, ['unassigned']), existing.unassigned),
      contactAttempts: toNumber(getValue(snapshot, ['contact_attempts']), existing.contactAttempts),
      bookings: toNumber(getValue(snapshot, ['bookings']), existing.bookings),
      completed: toNumber(getValue(snapshot, ['completed']), existing.completed),
      lost: toNumber(getValue(snapshot, ['lost']), existing.lost),
      expired: toNumber(getValue(snapshot, ['expired']), existing.expired),
      bookingCancelled: toNumber(getValue(snapshot, ['booking_cancelled']), existing.bookingCancelled),
      reviewRequests: toNumber(getValue(snapshot, ['review_requests']), existing.reviewRequests),
    })
  }

  return [...agentRowsById.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function fetchLiveReportingData(orgId: string, period: ReportPeriod): Promise<ReportingResult> {
  const [events, leads, profiles] = await Promise.all([
    fetchLeadEvents(orgId, period),
    fetchLeads(orgId, period),
    fetchOrgProfiles(orgId),
  ])

  return {
    period,
    ...aggregateReportingData(events, leads, profiles),
  }
}

async function fetchSnapshotReportingData(orgId: string, period: ReportPeriod): Promise<ReportingResult> {
  const [orgSnapshot, agentSnapshots, profiles] = await Promise.all([
    fetchSnapshotOrgReport(orgId, period),
    fetchSnapshotAgentReports(orgId, period),
    fetchOrgProfiles(orgId),
  ])

  if (!orgSnapshot) {
    throw new Error(`No monthly snapshot found for ${period.label}. Run the snapshot backfill for that month.`)
  }

  const summary = buildSummaryFromSnapshot(orgSnapshot)

  return {
    period,
    summary,
    sourceBreakdown: parseSourceBreakdown(getValue(orgSnapshot, ['source_breakdown'])),
    conversions: buildConversionsFromSnapshot(orgSnapshot, summary),
    timing: buildTimingFromSnapshot(orgSnapshot),
    agentRows: buildAgentRowsFromSnapshot(agentSnapshots, profiles),
  }
}

function isCurrentMonth(monthStart: Date): boolean {
  return getMonthKey(getMonthStart(new Date())) === getMonthKey(getMonthStart(monthStart))
}

function shouldFallbackToLiveClosedMonth(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message
  return (
    message === CLOSED_MONTH_SNAPSHOT_DEPENDENCY_ERROR ||
    message.startsWith(CLOSED_MONTH_SNAPSHOT_MISSING_PREFIX)
  )
}

export async function fetchReportingData(orgId: string, monthStart: Date): Promise<ReportingResult> {
  const period = buildReportPeriod(monthStart)
  if (isCurrentMonth(period.monthStart)) {
    return fetchLiveReportingData(orgId, period)
  }
  try {
    return await fetchSnapshotReportingData(orgId, period)
  } catch (error) {
    if (!shouldFallbackToLiveClosedMonth(error)) throw error
    return fetchLiveReportingData(orgId, period)
  }
}
