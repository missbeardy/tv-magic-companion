import { supabase } from './supabase'

export interface PriceListItem {
  id: string
  label: string
  description: string | null
  amount: number
  sort_order: number
  active: boolean
  usage_count: number
  last_used_at: string | null
}

/** Active price list items for an org, favourites (most-used) first. */
export async function fetchActivePriceListItems(orgId: string): Promise<PriceListItem[]> {
  const { data, error } = await supabase
    .from('price_list_items')
    .select('id, label, description, amount, sort_order, active, usage_count, last_used_at')
    .eq('org_id', orgId)
    .eq('active', true)
    .order('usage_count', { ascending: false })
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as PriceListItem[]
}

/** Fire-and-forget usage tracking for the "quick add" chips. */
export function recordPriceListItemUsage(item: Pick<PriceListItem, 'id' | 'usage_count'>): void {
  supabase
    .from('price_list_items')
    .update({ usage_count: item.usage_count + 1, last_used_at: new Date().toISOString() })
    .eq('id', item.id)
    .then(({ error }) => {
      if (error) console.error('Failed to record price list item usage:', error.message)
    })
}
