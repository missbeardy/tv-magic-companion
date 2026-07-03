/** Shared assign-timer expiry logic (mirrors public.expire_overdue_leads SQL). */

import type { SupabaseClient } from '@supabase/supabase-js'

export const EXPIRE_OVERDUE_LEADS_PATCH = {
  status: 'unassigned',
  assigned_to: null,
  assigned_at: null,
  timer_expires_at: null,
  contact_attempt_round: 0,
  last_contact_attempted_at: null,
  lost_reason: null,
} as const

export interface AssignTimerExpiredLead {
  id: string
  org_id: string
  name: string
  status: string
  assigned_to: string | null
  timer_expires_at: string | null
}

export interface AssignTimerExpiredEvent {
  lead_id: string
  org_id: string
  event_type: 'expired'
  note: string
  payload: {
    from_status: 'assigned'
    to_status: 'unassigned'
    source: 'assign_timer'
    lead_name: string
    previous_assignee_id: string | null
    previous_assignee_name: string | null
  }
  actor_id: string | null
}

export interface ExpireOverdueLeadsResult {
  expired: number
  errors: string[]
}

export function isAssignTimerExpired(lead: AssignTimerExpiredLead, nowMs: number): boolean {
  if (lead.status !== 'assigned') return false
  if (!lead.timer_expires_at) return false
  const expiresMs = Date.parse(lead.timer_expires_at)
  return !Number.isNaN(expiresMs) && expiresMs < nowMs
}

export function buildAssignTimerExpiredEvent(
  lead: Pick<AssignTimerExpiredLead, 'id' | 'org_id' | 'name' | 'assigned_to'>,
  assigneeName?: string | null
): AssignTimerExpiredEvent {
  const trimmedAssignee = assigneeName?.trim() ?? null
  const assigneeSuffix = trimmedAssignee ? ` (assigned to ${trimmedAssignee})` : ''

  return {
    lead_id: lead.id,
    org_id: lead.org_id,
    event_type: 'expired',
    note: `${lead.name} — assign timer expired${assigneeSuffix}`,
    payload: {
      from_status: 'assigned',
      to_status: 'unassigned',
      source: 'assign_timer',
      lead_name: lead.name,
      previous_assignee_id: lead.assigned_to,
      previous_assignee_name: trimmedAssignee,
    },
    actor_id: lead.assigned_to,
  }
}

export async function runExpireOverdueLeads(
  supabase: SupabaseClient,
  options?: { nowMs?: number }
): Promise<ExpireOverdueLeadsResult> {
  const nowMs = options?.nowMs ?? Date.now()
  const cutoff = new Date(nowMs).toISOString()
  const result: ExpireOverdueLeadsResult = { expired: 0, errors: [] }

  const { data, error } = await supabase
    .from('leads')
    .select('id, org_id, name, assigned_to, status, timer_expires_at')
    .eq('status', 'assigned')
    .not('timer_expires_at', 'is', null)
    .lt('timer_expires_at', cutoff)

  if (error) {
    throw new Error(`Failed to load overdue assigned leads: ${error.message}`)
  }

  const leads = (data ?? []) as AssignTimerExpiredLead[]

  for (const lead of leads) {
    const event = buildAssignTimerExpiredEvent(lead)
    const { error: eventError } = await supabase.from('lead_events').insert(event)
    if (eventError) {
      result.errors.push(`${lead.id} event: ${eventError.message}`)
      continue
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(EXPIRE_OVERDUE_LEADS_PATCH)
      .eq('id', lead.id)

    if (updateError) {
      result.errors.push(`${lead.id}: ${updateError.message}`)
      continue
    }

    result.expired += 1
  }

  return result
}
