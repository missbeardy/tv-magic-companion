import type { Database } from '../types/database.types'

/** Row / Insert / Update aliases derived from the generated Supabase schema. */
export type Tables = Database['public']['Tables']

export type LeadRow = Tables['leads']['Row']
export type LeadUpdate = Tables['leads']['Update']
export type EventRow = Tables['events']['Row']
export type EventUpdate = Tables['events']['Update']
export type SupportMessageInsert = Tables['support_messages']['Insert']

/**
 * Shared update builders live in `shared/` (also compiled by the API/node
 * project) so they cannot import the browser-only generated types; they return
 * `Record<string, unknown>`. Cast such payloads at the Supabase seam.
 */
export const asLeadUpdate = (patch: Record<string, unknown>): LeadUpdate =>
  patch as LeadUpdate

/**
 * `support_messages.org_id` is populated by a BEFORE INSERT trigger from the
 * thread owner's profile (never trusted from the client), so the client omits
 * it. Cast at the seam to satisfy the typed insert, which lists it as required.
 */
export const asSupportMessageInsert = (patch: Record<string, unknown>): SupportMessageInsert =>
  patch as SupportMessageInsert
