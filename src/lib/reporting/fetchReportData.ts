import { supabase } from '../supabase'
import { aggregateReportingData } from './aggregateReports'
import { buildReportPeriod, getMonthStart } from './dateRange'
import type {
  AgentProfileRow,
  LeadEventRow,
  LeadRow,
  ReportPeriod,
  ReportingAggregateResult,
} from './types'

export interface ReportingResult extends ReportingAggregateResult {
  period: ReportPeriod
}

export async function fetchFirstLeadEventMonth(orgId: string): Promise<Date | null> {
  const { data, error } = await supabase
    .from('lead_events')
    .select('created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data?.created_at) return null

  const firstDate = new Date(data.created_at)
  if (Number.isNaN(firstDate.getTime())) return null
  return getMonthStart(firstDate)
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
    .in('role', ['manager', 'employee', 'platform_admin'])

  if (error) throw error
  return (data ?? []) as AgentProfileRow[]
}

export async function fetchReportingData(orgId: string, monthStart: Date): Promise<ReportingResult> {
  const period = buildReportPeriod(monthStart)
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
