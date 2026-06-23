import type { Brand } from './theme'

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
  upsell_items?: Brand['upsell_items']
}): BrandTransferPayload {
  return {
    brand_id: brand.id,
    primary_color: brand.primary_color,
    secondary_color: brand.secondary_color,
    upsell_items: brand.upsell_items ?? [],
  }
}
