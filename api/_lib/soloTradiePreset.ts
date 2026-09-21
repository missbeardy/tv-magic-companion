import type { FeatureSwitchKey } from '../../shared/featureSwitchCatalog.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'

/**
 * Wedge switches for a "standard solo tradie" org (T2.6).
 * Applied as org_feature_switch_overrides at create time when the
 * platform admin opts into the preset.
 */
export const SOLO_TRADIE_PRESET_KEYS: readonly FeatureSwitchKey[] = [
  'inbound_sms',
  'inbound_email',
  'inbound_calls',
  'lead_ack_sms',
  'manager_new_lead_alerts',
  'booking_confirm',
  'booking_reminder_sms',
  'quote_esign',
  'one_tap_invoice',
  'review_requests',
  'auto_review_on_paid',
  'accounting_export',
  'customer_ontheway_sms',
  'customer_linking',
  'onboarding_tips',
] as const

export async function applySoloTradiePresetToOrg(
  orgId: string,
  updatedBy?: string | null
): Promise<{ updated: number }> {
  const supabase = getSupabaseAdmin()
  if (!supabase || !orgId) return { updated: 0 }

  let updated = 0
  for (const featureKey of SOLO_TRADIE_PRESET_KEYS) {
    const row: Record<string, unknown> = {
      org_id: orgId,
      feature_key: featureKey,
      enabled: true,
    }
    if (updatedBy) row.updated_by = updatedBy

    const { error } = await supabase.from('org_feature_switch_overrides').upsert(row, {
      onConflict: 'org_id,feature_key',
    })
    if (!error) updated++
    else console.error('solo tradie preset upsert failed:', featureKey, error.message)
  }
  return { updated }
}
