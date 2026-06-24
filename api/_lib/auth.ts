import type { VercelRequest } from '@vercel/node'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import type { SubscriptionTier } from './tier.js'

export interface AuthContext {
  userId: string
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
  }
  brand: {
    sms_templates: Record<string, string>
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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile?.org_id) return { auth: null, reason: 'no_profile' }

  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('id, name, slug, subscription_tier, support_phone, stripe_customer_id, brand_id')
    .eq('id', profile.org_id)
    .single()

  if (orgError || !org) return { auth: null, reason: 'no_org' }

  let brand: AuthContext['brand'] = null
  if (org.brand_id) {
    const { data: brandRow } = await supabase
      .from('brands')
      .select('sms_templates')
      .eq('id', org.brand_id)
      .maybeSingle()
    if (brandRow?.sms_templates) {
      brand = { sms_templates: brandRow.sms_templates as Record<string, string> }
    }
  }

  return {
    auth: {
      userId: userData.user.id,
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
