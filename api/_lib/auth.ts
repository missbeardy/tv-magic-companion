import type { VercelRequest } from '@vercel/node'
import { getSupabaseAdmin } from './supabaseAdmin'
import type { SubscriptionTier } from './tier'

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
    brand_id: string | null
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

export async function authenticateRequest(req: VercelRequest): Promise<AuthContext | null> {
  const supabase = getSupabaseAdmin()
  const accessToken = extractBearerToken(req)
  if (!supabase || !accessToken) return null

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData?.user) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile?.org_id) return null

  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('id, name, slug, subscription_tier, support_phone, brand_id')
    .eq('id', profile.org_id)
    .single()

  if (orgError || !org) return null

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
    userId: userData.user.id,
    role: profile.role,
    orgId: profile.org_id,
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      subscription_tier: org.subscription_tier as SubscriptionTier,
      support_phone: org.support_phone,
      brand_id: org.brand_id,
    },
    brand,
  }
}
