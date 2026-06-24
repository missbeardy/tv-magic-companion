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
  billing_status?: 'manual' | 'trialing' | 'active' | 'past_due' | 'canceled'
  stripe_customer_id?: string | null
  lead_count_this_month: number
  brand_id?: string | null
  google_review_url?: string | null
  review_requests_enabled?: boolean
}

interface OrgContextType {
  org: Org | null
  brand: Brand | null
  loading: boolean
  refreshOrg: () => Promise<void>
  canAccessFeature: (feature: string) => boolean
  getRemainingLeads: () => number
}
