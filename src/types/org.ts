import type { Brand } from '../lib/theme'

export type { Brand }

export interface Org {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  support_phone: string | null
  support_email: string | null
  subscription_tier: 'basic' | 'pro' | 'enterprise'
  subscription_expires_at: string | null
  lead_count_this_month: number
  brand_id?: string | null
}

interface OrgContextType {
  org: Org | null
  brand: Brand | null
  loading: boolean
  refreshOrg: () => Promise<void>
  canAccessFeature: (feature: string) => boolean
  getRemainingLeads: () => number
}
