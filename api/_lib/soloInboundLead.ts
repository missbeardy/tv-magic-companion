import type { SupabaseClient } from '@supabase/supabase-js'

const SOLO_ASSIGN_TIMER_HOURS = 24

export async function getSoloOwnerProfileId(
  supabase: SupabaseClient,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .in('role', ['manager', 'platform_admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

export async function isSoloOrg(supabase: SupabaseClient, orgId: string): Promise<boolean> {
  const { data } = await supabase
    .from('orgs')
    .select('operation_mode')
    .eq('id', orgId)
    .maybeSingle()

  return data?.operation_mode === 'solo'
}

/** Apply solo auto-claim fields when org is in solo mode. */
export async function applySoloInboundAssignment(
  supabase: SupabaseClient,
  orgId: string,
  basePayload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!(await isSoloOrg(supabase, orgId))) {
    return { ...basePayload, status: basePayload.status ?? 'unassigned' }
  }

  const ownerId = await getSoloOwnerProfileId(supabase, orgId)
  if (!ownerId) {
    return { ...basePayload, status: basePayload.status ?? 'unassigned' }
  }

  const timerExpires = new Date()
  timerExpires.setHours(timerExpires.getHours() + SOLO_ASSIGN_TIMER_HOURS)

  return {
    ...basePayload,
    status: 'assigned',
    assigned_to: ownerId,
    assigned_at: new Date().toISOString(),
    timer_expires_at: timerExpires.toISOString(),
  }
}
