import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildFollowUpNotificationCopy,
  CONTACT_FOLLOW_UP_MS,
  processContactFollowUpRollovers,
  type ContactFollowUpLead,
} from '../../shared/contactFollowUp.js'
import { getPlatformUrl } from './platformUrl.js'
import { notifyOrgUser } from './notifyUser.js'

export interface CronLeadRow extends ContactFollowUpLead {
  org_id: string
  name: string
  service_type: string | null
}

export interface ContactFollowUpCronResult {
  checked: number
  reminded: number
  lost: number
  notified: number
  errors: string[]
}

export async function runContactFollowUpCron(
  supabase: SupabaseClient,
  options?: { nowMs?: number }
): Promise<ContactFollowUpCronResult> {
  const nowMs = options?.nowMs ?? Date.now()
  const cutoff = new Date(nowMs - CONTACT_FOLLOW_UP_MS).toISOString()

  const { data, error } = await supabase
    .from('leads')
    .select(
      'id, org_id, name, service_type, status, assigned_to, contact_attempt_round, last_contact_attempted_at'
    )
    .eq('status', 'contact_attempted')
    .not('last_contact_attempted_at', 'is', null)
    .lte('last_contact_attempted_at', cutoff)

  if (error) {
    throw new Error(`Failed to load contact_attempted leads: ${error.message}`)
  }

  const leads = (data ?? []) as CronLeadRow[]
  const result: ContactFollowUpCronResult = {
    checked: leads.length,
    reminded: 0,
    lost: 0,
    notified: 0,
    errors: [],
  }

  if (leads.length === 0) return result

  await processContactFollowUpRollovers(
    leads,
    async (leadId, update) => {
      const { error: updateError } = await supabase.from('leads').update(update).eq('id', leadId)
      if (updateError) {
        result.errors.push(`${leadId}: ${updateError.message}`)
        return false
      }
      return true
    },
    async (leadId, eventType, note, payload) => {
      const lead = leads.find((row) => row.id === leadId)
      if (!lead) return

      const { error: eventError } = await supabase.from('lead_events').insert({
        lead_id: leadId,
        org_id: lead.org_id,
        event_type: eventType,
        note,
        payload,
        created_at: new Date(nowMs).toISOString(),
      })
      if (eventError) {
        result.errors.push(`${leadId} event: ${eventError.message}`)
      }

      if (eventType === 'lost') {
        result.lost += 1
      }
    },
    async (lead) => {
      result.reminded += 1
      if (!lead.assigned_to) return

      const round = lead.contact_attempt_round ?? 0
      const { title, message } = buildFollowUpNotificationCopy(lead.name, lead.service_type, round)
      const notify = await notifyOrgUser({
        supabase,
        orgId: lead.org_id,
        userId: lead.assigned_to,
        title,
        message,
        type: 'contact_follow_up',
        leadId: lead.id,
        url: `${getPlatformUrl()}/leads?lead=${lead.id}`,
      })
      if (notify.ok) {
        result.notified += 1
      } else if (notify.error) {
        result.errors.push(`${lead.id} notify: ${notify.error}`)
      }
    },
    { nowMs }
  )

  return result
}
