import type { SupabaseClient } from '@supabase/supabase-js'

/** Normalize an AU DID to E.164 for org_phone_numbers lookup. */
export function normalizeDidForLookup(phone: string): string {
  let normalized = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  if (normalized.startsWith('61')) normalized = '+' + normalized
  else if (normalized.startsWith('0')) normalized = '+61' + normalized.slice(1)
  else if (!normalized.startsWith('+')) normalized = '+' + normalized
  return normalized
}

/** Resolve franchise org from called DID, with DEFAULT_ORG_ID fallback. */
export async function resolveOrgIdFromDid(
  supabase: SupabaseClient,
  calledNumber: string | null | undefined
): Promise<string | null> {
  if (calledNumber?.trim()) {
    const normalizedTo = normalizeDidForLookup(calledNumber)
    const { data: mapping } = await supabase
      .from('org_phone_numbers')
      .select('org_id')
      .eq('phone_number', normalizedTo)
      .maybeSingle()
    if (mapping?.org_id) return mapping.org_id
  }

  return process.env.DEFAULT_ORG_ID || null
}
