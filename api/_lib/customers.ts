import { getSupabaseAdmin } from './supabaseAdmin.js'
import { phoneCandidates } from './phone.js'

export interface CustomerLinkInput {
  orgId: string
  name: string | null
  phone: string | null
  email: string | null
  address: string | null
}

export interface CustomerLinkResult {
  customerId: string | null
  matched: boolean
  created: boolean
}

const NULL_RESULT: CustomerLinkResult = { customerId: null, matched: false, created: false }

/**
 * Match an inbound lead to an existing customer (by email, then phone, within
 * the org) or create one, returning the customer id to stamp on the lead.
 *
 * TENANT ISOLATION: runs with the admin client (getSupabaseAdmin bypasses RLS),
 * so every query and insert MUST filter/set org_id explicitly, and we abort
 * entirely when orgId is falsy — never insert a customer row without an org.
 *
 * FAIL-OPEN: this is best-effort enrichment, never identity/auth. Any error is
 * swallowed (logged without field values) and returns the null result so the
 * lead pipeline is never blocked. Multiple matches resolve to the most recent.
 */
export async function linkCustomerForLead(input: CustomerLinkInput): Promise<CustomerLinkResult> {
  // Tenant boundary: no org → no customer work at all.
  if (!input.orgId) return NULL_RESULT

  const name = input.name?.trim() || ''
  const phone = input.phone?.trim() || null
  const email = input.email?.trim() || null
  const address = input.address?.trim() || null

  // A name alone is not identity — nothing to match or meaningfully create.
  if (!phone && !email) return NULL_RESULT

  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) return NULL_RESULT

    // 1. Match by email first (case-insensitive), most recent wins.
    if (email) {
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, email, address')
        .eq('org_id', input.orgId)
        .ilike('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
      const match = data?.[0]
      if (match) {
        await backfillCustomer(supabase, input.orgId, match, { name, phone, email, address })
        return { customerId: match.id, matched: true, created: false }
      }
    }

    // 2. Then by phone (any stored format), most recent wins.
    if (phone) {
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, email, address')
        .eq('org_id', input.orgId)
        .in('phone', phoneCandidates(phone))
        .order('created_at', { ascending: false })
        .limit(1)
      const match = data?.[0]
      if (match) {
        await backfillCustomer(supabase, input.orgId, match, { name, phone, email, address })
        return { customerId: match.id, matched: true, created: false }
      }
    }

    // 3. No match → create from the lead's own fields.
    const { data: created, error } = await supabase
      .from('customers')
      .insert({ org_id: input.orgId, name, phone, email, address })
      .select('id')
      .single()
    if (error || !created) {
      console.error('linkCustomerForLead insert failed:', error?.message)
      return NULL_RESULT
    }
    return { customerId: created.id, matched: false, created: true }
  } catch (err) {
    console.error('linkCustomerForLead failed:', err instanceof Error ? err.message : String(err))
    return NULL_RESULT
  }
}

interface CustomerRow {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  address: string | null
}

/**
 * Best-effort: fill in customer columns that are currently null from the lead's
 * fields. Never overwrites existing non-null customer data; errors are swallowed.
 */
async function backfillCustomer(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  orgId: string,
  existing: CustomerRow,
  incoming: { name: string; phone: string | null; email: string | null; address: string | null }
): Promise<void> {
  const patch: Record<string, string> = {}
  if (!existing.name?.trim() && incoming.name) patch.name = incoming.name
  if (!existing.phone?.trim() && incoming.phone) patch.phone = incoming.phone
  if (!existing.email?.trim() && incoming.email) patch.email = incoming.email
  if (!existing.address?.trim() && incoming.address) patch.address = incoming.address
  if (Object.keys(patch).length === 0) return

  try {
    await supabase
      .from('customers')
      .update(patch)
      .eq('id', existing.id)
      .eq('org_id', orgId)
  } catch (err) {
    console.error('linkCustomerForLead backfill failed:', err instanceof Error ? err.message : String(err))
  }
}
