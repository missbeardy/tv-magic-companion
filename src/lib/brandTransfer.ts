import type { Brand } from './theme'
import type { Json } from '../types/database.types'

/** Fields copied from a brand template onto a franchisee org */
export interface BrandTransferPayload {
  brand_id: string
  primary_color: string
  secondary_color: string
  upsell_items: Brand['upsell_items']
}

export function buildBrandTransferPayload(brand: {
  id: string
  primary_color: string
  secondary_color: string
  // Accept the generated `Json` shape too — callers reading brands via the
  // typed Supabase client get `upsell_items: Json`.
  upsell_items?: Brand['upsell_items'] | Json
}): BrandTransferPayload {
  return {
    brand_id: brand.id,
    primary_color: brand.primary_color,
    secondary_color: brand.secondary_color,
    upsell_items: (brand.upsell_items ?? []) as Brand['upsell_items'],
  }
}
