import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildFollowUpNotificationCopy,
  CONTACT_FOLLOW_UP_MS,
  CONTACT_FOLLOW_UP_REMINDER_BATCH_SIZE,
  processContactFollowUpRollovers,
  selectFollowUpReminderBatch,
  type ContactFollowUpLead,
} from '../../shared/contactFollowUp.js'
import { getPlatformUrl } from './platformUrl.js'
import { insertTrustedFollowUpReminder } from './notifyUser.js'

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
  remaining: number
  errors: string[]
}

/**
 * Explicit ceiling on the candidate load. PostgREST silently caps an unbounded select at 1000
 * rows, so without this the sweep could truncate without saying so. Ordering oldest-first means
 * that if the cap is ever reached, the leads nearest auto-lost are the ones that get processed.
 */
export const CANDIDATE_LOAD_LIMIT = 1000

export async function runContactFollowUpCron(
  supabase: SupabaseClient,
  options?: { nowMs?: number }
): Promise<ContactFollowUpCronResult> {
  const nowMs = options?.nowMs ?? Date.now()
  const cutoff = new Date(nowMs - CONTACT_FOLLOW_UP_MS).toISOString()

  const { data, error } = await supabase
    .from('leads')
    .select(
      'id, org_id, name, service_type, status, assigned_to, contact_attempt_round, last_contact_attempted_at, last_follow_up_reminder_at'
    )
    .eq('status', 'contact_attempted')
    .is('deleted_at', null)
    .not('last_contact_attempted_at', 'is', null)
    .lte('last_contact_attempted_at', cutoff)
    .order('last_contact_attempted_at', { ascending: true })
    .limit(CANDIDATE_LOAD_LIMIT)

  if (error) {
    throw new Error(`Failed to load contact_attempted leads: ${error.message}`)
  }

  const leads = (data ?? []) as CronLeadRow[]
  if (leads.length === CANDIDATE_LOAD_LIMIT) {
    console.warn(
      `[FOLLOWUP_CANDIDATE_CAP] loaded ${CANDIDATE_LOAD_LIMIT} candidates; older leads deferred to the next tick`
    )
  }

  const result: ContactFollowUpCronResult = {
    checked: leads.length,
    reminded: 0,
    lost: 0,
    notified: 0,
    remaining: 0,
    errors: [],
  }

  if (leads.length === 0) return result

  const afterLost = await processContactFollowUpRollovers(
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
        // Deliberately no `lost` increment here: the status update already committed, but the
        // transition has no audit row, so counting it would make the heartbeat disagree with
        // lead_events. The error above is the record that this happened.
        return
      }

      if (eventType === 'lost') {
        result.lost += 1
      }
    },
    undefined,
    { nowMs }
  )

  const { batch, remaining } = selectFollowUpReminderBatch(
    afterLost,
    nowMs,
    CONTACT_FOLLOW_UP_REMINDER_BATCH_SIZE
  )
  result.remaining = remaining
  if (batch.length === 0) return result

  // Stamp the cooldown BEFORE notifying, and regardless of whether there's an assignee to
  // notify. Without this the lead stays eligible and re-fires on every 15-minute cron run
  // forever (29,825 notifications in prod over five weeks before this was caught).
  // Stamping first also means a notify failure can't leave the lead in a re-notify loop.
  const stampIso = new Date(nowMs).toISOString()
  const { error: stampError } = await supabase
    .from('leads')
    .update({ last_follow_up_reminder_at: stampIso })
    .in('id', batch.map((lead) => lead.id))
  if (stampError) {
    result.errors.push(`reminder stamp: ${stampError.message}`)
    return result
  }
  result.reminded = batch.length

  for (const lead of batch) {
    if (!lead.assigned_to) continue

    const round = lead.contact_attempt_round ?? 0
    const { title, message } = buildFollowUpNotificationCopy(lead.name, lead.service_type, round)
    const notify = await insertTrustedFollowUpReminder({
      supabase,
      orgId: lead.org_id,
      userId: lead.assigned_to,
      title,
      message,
      leadId: lead.id,
      url: `${getPlatformUrl()}/leads?lead=${lead.id}`,
    })
    if (notify.ok) {
      result.notified += 1
    } else if (notify.error) {
      result.errors.push(`${lead.id} notify: ${notify.error}`)
    }
  }

  return result
}
