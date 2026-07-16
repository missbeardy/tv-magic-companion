import { describe, expect, it } from 'vitest'
import {
  FEATURE_SWITCH_CATEGORIES,
  FEATURE_SWITCH_CATEGORY_BY_KEY,
  FEATURE_SWITCH_CATEGORY_LABELS,
  FEATURE_SWITCH_KEYS,
  FEATURE_SWITCHES_BY_CATEGORY,
} from '../shared/featureSwitchCatalog'

describe('featureSwitchCatalog categories', () => {
  it('maps every feature key to exactly one category', () => {
    for (const key of FEATURE_SWITCH_KEYS) {
      expect(FEATURE_SWITCH_CATEGORY_BY_KEY[key]).toBeTruthy()
    }
    expect(Object.keys(FEATURE_SWITCH_CATEGORY_BY_KEY)).toHaveLength(FEATURE_SWITCH_KEYS.length)
  })

  it('partitions all keys across categories with no duplicates', () => {
    const seen = new Set<string>()
    for (const category of FEATURE_SWITCH_CATEGORIES) {
      expect(FEATURE_SWITCH_CATEGORY_LABELS[category]).toBeTruthy()
      for (const key of FEATURE_SWITCHES_BY_CATEGORY[category]) {
        expect(seen.has(key)).toBe(false)
        seen.add(key)
        expect(FEATURE_SWITCH_CATEGORY_BY_KEY[key]).toBe(category)
      }
    }
    expect(seen.size).toBe(FEATURE_SWITCH_KEYS.length)
  })

  it('uses canonical category groupings', () => {
    expect(FEATURE_SWITCHES_BY_CATEGORY.lead_intake).toEqual([
      'inbound_sms',
      'inbound_email',
      'inbound_calls',
      'inbound_messenger',
      'customer_linking',
    ])
    expect(FEATURE_SWITCHES_BY_CATEGORY.customer_communication).toEqual([
      'missed_call_hookback_sms',
      'lead_ack_sms',
      'lead_ack_email',
      'customer_ontheway_sms',
      'booking_confirm',
      'booking_reminder_sms',
      'review_requests',
    ])
    expect(FEATURE_SWITCHES_BY_CATEGORY.team_operations).toEqual([
      'manager_new_lead_alerts',
      'smart_assign_badge',
      'inbound_auto_assign',
      'tech_location',
      'internal_messaging',
      'customer_profiles',
    ])
    expect(FEATURE_SWITCHES_BY_CATEGORY.sales_job_completion).toEqual([
      'quote_esign',
      'completion_upsells',
      'one_tap_invoice',
      'invoice_chase',
      'quote_chase',
      'price_list',
      'invoice_card_payments',
      'accounting_export',
    ])
  })
})
