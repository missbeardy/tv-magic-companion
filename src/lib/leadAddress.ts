import { supabase } from './supabase'
import { logLeadEvent } from './leadEvents'

export async function updateLeadAddress(
  leadId: string,
  address: string,
  orgId: string,
  actorId: string
): Promise<{ error?: string }> {
  const trimmed = address.trim()
  const value = trimmed || null

  const { error: leadError } = await supabase
    .from('leads')
    .update({ address: value })
    .eq('id', leadId)

  if (leadError) return { error: leadError.message }

  const now = new Date().toISOString()
  const { error: eventsError } = await supabase
    .from('events')
    .update({ client_address: value })
    .eq('lead_id', leadId)
    .gte('start_time', now)

  if (eventsError) return { error: eventsError.message }

  const { error: logError } = await logLeadEvent({
    leadId,
    orgId,
    eventType: 'status_change',
    note: 'Address updated',
    actorId,
    payload: { address: value },
  })

  if (logError) return { error: logError.message }

  return {}
}
