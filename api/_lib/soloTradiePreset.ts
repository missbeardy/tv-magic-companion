import type { FeatureSwitchKey } from '../../shared/featureSwitchCatalog.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'

/**
 * Wedge switches for a "standard solo tradie" org (T2.6).
 * Applied as brand_feature_switches for the org's brand at create time
 * when the platform admin opts into the preset.
 */
export const SOLO_TRADIE_PRESET_KEYS: readonly FeatureSwitchKey[] = [
  'inbound_sms',
  'inbound_email',
  'inbound_calls',
  'lead_ack_sms',
  'lead_ack_email',
  'missed_call_hookback_sms',
  'manager_new_lead_alerts',
  'booking_confirm',
  'booking_reminder_sms',
  'quote_esign',
  'one_tap_invoice',
  'invoice_chase',
  'quote_chase',
  'review_requests',
  'auto_review_on_paid',
  'price_list',
  'accounting_export',
  'customer_ontheway_sms',
  'customer_linking',
  'customer_import',
  'onboarding_tips',
] as const

export async function applySoloTradiePresetToBrand(
  brandId: string,
  updatedBy?: string | null
): Promise<{ updated: number }> {
  const supabase = getSupabaseAdmin()
  if (!supabase || !brandId) return { updated: 0 }

  let updated = 0
  for (const featureKey of SOLO_TRADIE_PRESET_KEYS) {
    const row: Record<string, unknown> = {
      brand_id: brandId,
      feature_key: featureKey,
      enabled: true,
    }
    if (updatedBy) row.updated_by = updatedBy

    const { error } = await supabase.from('brand_feature_switches').upsert(row, {
      onConflict: 'brand_id,feature_key',
    })
    if (!error) updated++
    else console.error('solo tradie preset upsert failed:', featureKey, error.message)
  }
  return { updated }
}
