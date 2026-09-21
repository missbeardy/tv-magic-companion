import { supabase } from './supabase'
import { asLeadUpdate } from './dbTypes'

export const LEAD_TRANSITION_CONFLICT = 'CONFLICT'

export function leadTransitionConflictMessage(fromStatus: string): string {
  return fromStatus === 'unassigned'
    ? 'This lead was just picked up by someone else'
    : 'This lead was just updated on another device.'
}

export type LeadTransitionResult =
  | { ok: true }
  | { ok: false; error: typeof LEAD_TRANSITION_CONFLICT | string }

/**
 * Status-guarded lead write. Zero rows means another device already moved the lead.
 * Callers must treat CONFLICT as "refetch and tell the user", not a silent success.
 */
export async function transitionLead(
  leadId: string,
  fromStatus: string,
  patch: Record<string, unknown>
): Promise<LeadTransitionResult> {
  const { data, error, count } = await supabase
    .from('leads')
    .update(asLeadUpdate(patch), { count: 'exact' })
    .eq('id', leadId)
    .eq('status', fromStatus)
    .select('id')

  if (error) return { ok: false, error: error.message }
  const rowsUpdated = count ?? data?.length ?? 0
  if (rowsUpdated === 0) return { ok: false, error: LEAD_TRANSITION_CONFLICT }
  return { ok: true }
}
