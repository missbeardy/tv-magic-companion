import type { SupabaseClient } from '@supabase/supabase-js'

/** Normalize an AU DID to E.164 for org_phone_numbers lookup. */
export function normalizeDidForLookup(phone: string): string {
  let normalized = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  if (normalized.startsWith('61')) normalized = '+' + normalized
  else if (normalized.startsWith('0')) normalized = '+61' + normalized.slice(1)
  else if (!normalized.startsWith('+')) normalized = '+' + normalized
  return normalized
}

export type DidOrgResolution =
  | { orgId: string; source: 'phone_mapping' }
  | { orgId: null; source: 'unresolved' }

/** Resolve franchise org from called DID via org_phone_numbers. */
export async function resolveOrgIdFromDid(
  supabase: SupabaseClient,
  calledNumber: string | null | undefined
): Promise<DidOrgResolution> {
  if (calledNumber?.trim()) {
    const normalizedTo = normalizeDidForLookup(calledNumber)
    const { data: mapping } = await supabase
      .from('org_phone_numbers')
      .select('org_id')
      .eq('phone_number', normalizedTo)
      .maybeSingle()
    if (mapping?.org_id) {
      return { orgId: mapping.org_id, source: 'phone_mapping' }
    }
  }

  return { orgId: null, source: 'unresolved' }
}
