import { supabase } from './supabase'
import { buildLeadEventInsert, type LeadEventInput } from './leadEventPayload'

async function resolveOrgId(leadId: string, orgId: string | null | undefined): Promise<string | null> {
  if (orgId) return orgId

  const { data, error } = await supabase
    .from('leads')
    .select('org_id')
    .eq('id', leadId)
    .maybeSingle()

  if (error) {
    console.error('Lead event org lookup failed:', error)
    return null
  }

  return data?.org_id ?? null
}

export async function logLeadEvent(input: LeadEventInput) {
  const orgId = await resolveOrgId(input.leadId, input.orgId)

  if (!orgId) {
    const error = { message: `Cannot log ${input.eventType}: missing org_id for lead ${input.leadId}` }
    console.error('Lead event logging failed:', error.message)
    return { error }
  }

  const { error } = await supabase
    .from('lead_events')
    .insert(buildLeadEventInsert({ ...input, orgId }))

  if (error) {
    console.error('Lead event logging failed:', error.message, error.details ?? '', error.hint ?? '')
  }

  return { error }
}
