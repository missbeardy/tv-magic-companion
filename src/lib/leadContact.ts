import { supabase } from './supabase'
import { logLeadEvent } from './leadEvents'

export interface LeadContactFields {
  name: string
  phone: string
  email: string
}

export async function updateLeadContact(
  leadId: string,
  fields: LeadContactFields,
  orgId: string,
  actorId: string
): Promise<{ error?: string }> {
  const name = fields.name.trim()
  if (!name) return { error: 'Name is required' }

  const phone = fields.phone.trim() || null
  const email = fields.email.trim() || null

  const { data: existing, error: fetchError } = await supabase
    .from('leads')
    .select('name, phone, email')
    .eq('id', leadId)
    .maybeSingle()

  if (fetchError) return { error: fetchError.message }

  const fieldsChanged: string[] = []
  if (existing?.name !== name) fieldsChanged.push('name')
  if ((existing?.phone ?? null) !== phone) fieldsChanged.push('phone')
  if ((existing?.email ?? null) !== email) fieldsChanged.push('email')

  const { error: leadError } = await supabase
    .from('leads')
    .update({ name, phone, email })
    .eq('id', leadId)

  if (leadError) return { error: leadError.message }

  const now = new Date().toISOString()
  const { error: eventsError } = await supabase
    .from('events')
    .update({ client_name: name, client_phone: phone, client_email: email })
    .eq('lead_id', leadId)
    .gte('start_time', now)

  if (eventsError) return { error: eventsError.message }

  if (fieldsChanged.length === 0) return {}

  const { error: logError } = await logLeadEvent({
    leadId,
    orgId,
    eventType: 'status_change',
    note: 'Contact details updated',
    actorId,
    payload: { fields_changed: fieldsChanged },
  })

  if (logError) return { error: logError.message }

  return {}
}
