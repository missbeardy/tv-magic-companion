import type { Database } from '../types/database.types'

/** Row / Insert / Update aliases derived from the generated Supabase schema. */
export type Tables = Database['public']['Tables']

export type LeadRow = Tables['leads']['Row']
export type LeadUpdate = Tables['leads']['Update']
export type EventRow = Tables['events']['Row']
export type EventUpdate = Tables['events']['Update']

/**
 * Shared update builders live in `shared/` (also compiled by the API/node
 * project) so they cannot import the browser-only generated types; they return
 * `Record<string, unknown>`. Cast such payloads at the Supabase seam.
 */
export const asLeadUpdate = (patch: Record<string, unknown>): LeadUpdate =>
  patch as LeadUpdate
