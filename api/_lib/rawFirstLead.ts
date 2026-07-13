import type { SupabaseClient } from '@supabase/supabase-js'
import { applySoloInboundAssignment } from './soloInboundLead.js'
import { applyTeamInboundAssignment } from './teamInboundLead.js'

export interface InsertRawFirstLeadResult {
  id: string
  inboundAutoAssign?: { assigneeId: string; assigneeName: string }
}

export interface ExtractedLeadFields {
  name?: string | null
  phone?: string | null
  email?: string | null
  service_type?: string | null
  details?: string | null
  address?: string | null
}

export interface RawFirstLeadPayload {
  org_id: string
  name: string
  phone?: string | null
  email?: string | null
  service_type: string
  details: string
  address?: string | null
  source: string
  lead_source?: string
  raw_sms?: string
  raw_email?: string
  created_at?: string
}

/** True when a value should be applied on top of raw-first placeholder fields. */
export function isExtractedValuePresent(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  return true
}

/** Strip empty/null extracted fields so raw-first placeholders are not wiped. */
export function pickExtractedFields(fields: ExtractedLeadFields): ExtractedLeadFields {
  const picked: ExtractedLeadFields = {}
  for (const [key, value] of Object.entries(fields) as [keyof ExtractedLeadFields, unknown][]) {
    if (!isExtractedValuePresent(value)) continue
    picked[key] = typeof value === 'string' ? value.trim() : (value as string | null)
  }
  return picked
}

/** Persist a minimal lead immediately before AI extraction (raw-first pattern). */
export async function insertRawFirstLead(
  supabase: SupabaseClient,
  orgId: string,
  payload: RawFirstLeadPayload
): Promise<InsertRawFirstLeadResult> {
  let insertPayload = await applySoloInboundAssignment(supabase, orgId, {
    ...payload,
    org_id: orgId,
    status: 'unassigned',
  })

  let inboundAutoAssign: InsertRawFirstLeadResult['inboundAutoAssign']
  if (insertPayload.status === 'unassigned') {
    const teamResult = await applyTeamInboundAssignment(supabase, orgId, insertPayload)
    insertPayload = teamResult.payload
    inboundAutoAssign = teamResult.inboundAutoAssign
  }

  const { data, error } = await supabase
    .from('leads')
    .insert(insertPayload)
    .select('id')
    .single()

  if (error) {
    console.error('insertRawFirstLead failed:', error.message, error.details)
    throw error
  }
  if (!data?.id) throw new Error('Lead insert returned no id')
  return { id: data.id, inboundAutoAssign }
}

/** Apply extracted fields to an existing raw-first lead (never overwrites with empty/null). */
export async function updateLeadFromExtraction(
  supabase: SupabaseClient,
  leadId: string,
  fields: ExtractedLeadFields
): Promise<void> {
  const update = pickExtractedFields(fields)
  if (Object.keys(update).length === 0) return

  const { error } = await supabase.from('leads').update(update).eq('id', leadId)
  if (error) {
    console.error('updateLeadFromExtraction failed:', error.message, error.details)
    throw error
  }
}

/** Parse a CloudMailin / RFC5322 From header into display name and email. */
export function parseEmailSender(from: string): { name: string; email: string | null } {
  const trimmed = from.trim()
  const angleMatch = trimmed.match(/^(.+?)\s*<([^>]+)>$/)
  if (angleMatch) {
    const name = angleMatch[1].replace(/^["']|["']$/g, '').trim() || angleMatch[2].trim()
    return { name, email: angleMatch[2].trim() }
  }
  const emailMatch = trimmed.match(/[\w.+-]+@[\w.-]+\.\w+/)
  if (emailMatch) {
    return { name: emailMatch[0], email: emailMatch[0] }
  }
  return { name: trimmed || 'Unknown Sender', email: null }
}
