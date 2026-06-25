import { getSupabaseAdmin } from './supabaseAdmin.js'

export type RuntimeFeatureKey = 'smart_assign_badge' | 'quote_esign'

export async function isFeatureEnabledForOrg(
  orgId: string,
  featureKey: RuntimeFeatureKey
): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase || !orgId || !featureKey) return false

  const [{ data: orgOverride }, { data: orgRow }, { data: catalogRow }] = await Promise.all([
    supabase
      .from('org_feature_switch_overrides')
      .select('enabled')
      .eq('org_id', orgId)
      .eq('feature_key', featureKey)
      .maybeSingle(),
    supabase
      .from('orgs')
      .select('brand_id, subscription_tier')
      .eq('id', orgId)
      .maybeSingle(),
    supabase
      .from('feature_flag_catalog')
      .select('default_enabled')
      .eq('feature_key', featureKey)
      .maybeSingle(),
  ])

  if (!orgRow) return false

  const requiredTier = featureKey === 'quote_esign' ? 'pro' : 'basic'
  const order = ['basic', 'pro', 'enterprise']
  if (order.indexOf(orgRow.subscription_tier ?? 'basic') < order.indexOf(requiredTier)) {
    return false
  }

  if (orgOverride?.enabled === true || orgOverride?.enabled === false) {
    return orgOverride.enabled
  }

  if (orgRow.brand_id) {
    const { data: brandSwitch } = await supabase
      .from('brand_feature_switches')
      .select('enabled')
      .eq('brand_id', orgRow.brand_id)
      .eq('feature_key', featureKey)
      .maybeSingle()
    if (brandSwitch?.enabled === true || brandSwitch?.enabled === false) {
      return brandSwitch.enabled
    }
  }

  return catalogRow?.default_enabled === true
}
