import type { SupabaseClient } from '@supabase/supabase-js'

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

/** Find an existing lead for the same phone + org within the last 24 hours. */
export async function findRecentLeadByPhone(
  supabase: SupabaseClient,
  phone: string,
  orgId: string | null
): Promise<{ id: string; name: string | null; extraction_status: string | null } | null> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
  const { data } = await supabase
    .from('leads')
    .select('id, name, extraction_status')
    .eq('phone', phone)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .gte('created_at', since)
    .maybeSingle()

  return data ?? null
}
