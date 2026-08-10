import type { VercelRequest } from '@vercel/node'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import type { SubscriptionTier } from './tier.js'

export interface AuthContext {
  userId: string
  email: string | null
  fullName: string | null
  role: string
  orgId: string
  org: {
    id: string
    name: string
    slug: string
    subscription_tier: SubscriptionTier
    support_phone: string | null
    stripe_customer_id: string | null
    brand_id: string | null
    google_review_url?: string | null
    review_requests_enabled?: boolean
    abn: string | null
    gst_registered: boolean
    stripe_connect_account_id: string | null
    stripe_connect_status: string | null
    email_templates: Record<string, string>
  }
  brand: {
    sms_templates: Record<string, string>
    email_templates: Record<string, string>
    primary_color: string
  } | null
}

function extractBearerToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization ?? req.headers['authorization']
  if (typeof authHeader !== 'string') return null
  return authHeader.replace(/^Bearer\s+/i, '').trim() || null
}

type AuthFailureReason = 'no_admin' | 'no_token' | 'invalid_token' | 'no_profile' | 'no_org'

export async function authenticateRequest(
  req: VercelRequest
): Promise<AuthContext | null> {
  const result = await authenticateRequestDetailed(req)
  return result.auth
}

export async function authenticateRequestDetailed(
  req: VercelRequest
): Promise<{ auth: AuthContext | null; reason?: AuthFailureReason }> {
  const supabase = getSupabaseAdmin()
  const accessToken = extractBearerToken(req)
  if (!supabase) return { auth: null, reason: 'no_admin' }
  if (!accessToken) return { auth: null, reason: 'no_token' }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData?.user) return { auth: null, reason: 'invalid_token' }

  // dd8: was 3 further round trips (profiles, then orgs, then brands) on every authenticated
  // request. A single PostgREST embedded-resource select over the org_id/brand_id foreign keys
  // does the equivalent of a join in one call — token verification (the actual security
  // boundary) stays a separate, uncached step above.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      `role, org_id, full_name,
       orgs (
         id, name, slug, subscription_tier, support_phone, stripe_customer_id, brand_id,
         google_review_url, review_requests_enabled, abn, gst_registered,
         stripe_connect_account_id, stripe_connect_status, email_templates,
         brands ( sms_templates, email_templates, primary_color )
       )`
    )
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile?.org_id) return { auth: null, reason: 'no_profile' }

  const org = Array.isArray(profile.orgs) ? profile.orgs[0] : profile.orgs
  if (!org) return { auth: null, reason: 'no_org' }

  const brandRow = Array.isArray(org.brands) ? org.brands[0] : org.brands
  const brand: AuthContext['brand'] = brandRow
    ? {
        sms_templates: (brandRow.sms_templates as Record<string, string>) ?? {},
        email_templates: (brandRow.email_templates as Record<string, string>) ?? {},
        primary_color: (brandRow.primary_color as string) || '#004B93',
      }
    : null

  return {
    auth: {
      userId: userData.user.id,
      email: userData.user.email ?? null,
      fullName: (profile.full_name as string | null) ?? null,
      role: profile.role,
      orgId: profile.org_id,
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        subscription_tier: org.subscription_tier as SubscriptionTier,
        support_phone: org.support_phone,
        stripe_customer_id: org.stripe_customer_id,
        brand_id: org.brand_id,
        google_review_url: (org.google_review_url as string | null) ?? null,
        review_requests_enabled: (org.review_requests_enabled as boolean | null) ?? undefined,
        abn: (org.abn as string | null) ?? null,
        gst_registered: (org.gst_registered as boolean | null) ?? true,
        stripe_connect_account_id: (org.stripe_connect_account_id as string | null) ?? null,
        stripe_connect_status: (org.stripe_connect_status as string | null) ?? null,
        email_templates: (org.email_templates as Record<string, string>) ?? {},
      },
      brand,
    },
  }
}

function authErrorMessage(reason?: AuthFailureReason): string {
  switch (reason) {
    case 'no_admin':
      return 'Server Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'
    case 'no_token':
      return 'Missing auth token — log out and sign in again.'
    case 'invalid_token':
      return 'Session invalid — your login may be for a different Supabase project than the server. Use the dev preview URL and check Vercel Preview env vars match VITE_SUPABASE_URL.'
    case 'no_profile':
      return 'No profile found for this account in the server database.'
    case 'no_org':
      return 'Organisation not found for this account.'
    default:
      return 'Unauthorized'
  }
}

export { authErrorMessage }
