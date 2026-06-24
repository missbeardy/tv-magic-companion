import { supabase } from './supabase'
import { buildLeadEventInsert, type LeadEventInput } from './leadEventPayload'

export async function logLeadEvent(input: LeadEventInput) {
  const { error } = await supabase
    .from('lead_events')
    .insert(buildLeadEventInsert(input))

  if (error) {
    console.warn('Lead event logging failed:', error)
  }

  return { error }
}
