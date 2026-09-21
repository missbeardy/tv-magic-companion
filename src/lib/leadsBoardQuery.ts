import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

export const LEADS_BOARD_LIMIT = 500
export const CLOSED_BOARD_STATUSES = ['completed', 'lost', 'booking_cancelled'] as const
export const CLOSED_LOOKBACK_DAYS = 30
export const LEAD_ID_IN_CHUNK = 80

export type LeadBoardBadgeRow = Database['public']['Views']['lead_board_badges']['Row']

/** Active leads plus closed jobs updated in the last 30 days. */
export function leadsBoardOrFilter(now = new Date()): string {
  const cutoff = new Date(now.getTime() - CLOSED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const closed = CLOSED_BOARD_STATUSES.join(',')
  return `status.not.in.(${closed}),and(status.in.(${closed}),updated_at.gte."${cutoff}")`
}

export function chunkIds(ids: string[], size = LEAD_ID_IN_CHUNK): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size))
  return chunks
}

export async function fetchLeadBoardBadges(
  client: Pick<SupabaseClient<Database>, 'from'>,
  orgId: string,
  leadIds: string[]
): Promise<LeadBoardBadgeRow[]> {
  const rows: LeadBoardBadgeRow[] = []
  for (const chunk of chunkIds(leadIds)) {
    const { data, error } = await client
      .from('lead_board_badges')
      .select(
        'org_id, lead_id, latest_quote_status, latest_quote_accepted_at, latest_quote_total_amount, latest_quote_scope, latest_invoice_status, latest_invoice_id, latest_invoice_number, last_manual_sms_text, last_manual_sms_at'
      )
      .eq('org_id', orgId)
      .in('lead_id', chunk)
    if (error) {
      console.warn('lead_board_badges query failed:', error.message)
      continue
    }
    if (data) rows.push(...data)
  }
  return rows
}
