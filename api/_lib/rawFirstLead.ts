import type { SupabaseClient } from '@supabase/supabase-js'
import { applySoloInboundAssignment } from './soloInboundLead.js'

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
): Promise<{ id: string }> {
  const insertPayload = await applySoloInboundAssignment(supabase, orgId, {
    ...payload,
    org_id: orgId,
    status: 'unassigned',
  })

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
  return { id: data.id }
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

/** Regex fallback when Claude email extraction fails. */
export function emailFallbackParse(
  emailText: string,
  subject: string,
  from: string
): ExtractedLeadFields {
  const { name, email } = parseEmailSender(from)
  const combined = `${subject} ${emailText}`.toLowerCase()

  let service_type = 'General Enquiry'
  if (combined.includes('aerial') || combined.includes('antenna')) service_type = 'TV Aerial'
  else if (combined.includes('satellite')) service_type = 'Satellite Dish'
  else if (combined.includes('cctv')) service_type = 'CCTV'

  const phoneMatch = emailText.match(/(?:phone|mobile|tel|contact)[:\s]*([+\d\s()-]{8,})/i)
  const addressMatch = emailText.match(/(?:address)[:\s]*(.+?)(?:\n|$)/i)
  const bodySnippet = emailText.replace(/\s+/g, ' ').trim().slice(0, 300)

  return {
    name,
    email,
    phone: phoneMatch?.[1]?.trim() ?? null,
    service_type,
    details: bodySnippet || subject || 'Inbound email enquiry',
    address: addressMatch?.[1]?.trim() ?? null,
  }
}
