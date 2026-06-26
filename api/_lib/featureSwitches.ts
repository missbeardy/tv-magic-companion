import { FEATURE_SWITCH_MIN_TIERS, type FeatureSwitchKey } from '../../shared/featureSwitchCatalog.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'

export type RuntimeFeatureKey = FeatureSwitchKey

const TIER_ORDER = ['basic', 'pro', 'enterprise'] as const

function tierMeetsMinimum(
  orgTier: string | null | undefined,
  minTier: string | null | undefined
): boolean {
  const tier = orgTier ?? 'basic'
  const required = minTier ?? 'basic'
  const userIdx = TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number])
  const reqIdx = TIER_ORDER.indexOf(required as (typeof TIER_ORDER)[number])
  if (userIdx === -1 || reqIdx === -1) return false
  return userIdx >= reqIdx
}

export async function isFeatureEnabledForOrg(
  orgId: string,
  featureKey: RuntimeFeatureKey
): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase || !orgId || !featureKey) return false

  const [{ data: orgRow }, { data: catalogRow }] = await Promise.all([
    supabase
      .from('orgs')
      .select('brand_id, subscription_tier')
      .eq('id', orgId)
      .maybeSingle(),
    supabase
      .from('feature_flag_catalog')
      .select('default_enabled, min_tier')
      .eq('feature_key', featureKey)
      .maybeSingle(),
  ])

  if (!orgRow) return false

  const minTier =
    (catalogRow?.min_tier as string | undefined) ?? FEATURE_SWITCH_MIN_TIERS[featureKey] ?? 'basic'
  if (!tierMeetsMinimum(orgRow.subscription_tier, minTier)) {
    return false
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
