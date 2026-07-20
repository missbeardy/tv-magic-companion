/** Assign-timer auto-unassign is disabled — leads stay with the assignee.

 * Kept for audit-event helpers / historical tests. `runExpireOverdueLeads` is a no-op
 * mirroring `public.expire_overdue_leads()` after disable_assign_timer_expiry.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** @deprecated Assign-timer expiry no longer resets leads to the pool. */
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

/** @deprecated Assign-timer expiry is disabled — always returns false. */
export function isAssignTimerExpired(_lead: AssignTimerExpiredLead, _nowMs: number): boolean {
  return false
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

/** No-op: assigned leads are no longer auto-returned to the pool. */
export async function runExpireOverdueLeads(
  _supabase: SupabaseClient,
  _options?: { nowMs?: number }
): Promise<ExpireOverdueLeadsResult> {
  return { expired: 0, errors: [] }
}
