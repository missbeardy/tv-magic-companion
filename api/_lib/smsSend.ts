import type { SupabaseClient } from '@supabase/supabase-js'
import { formatAuPhoneForSms } from './phone.js'
import { isPhoneOptedOut } from './smsOptOut.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { isTwilioConfigured, postTwilioSms } from './twilioSend.js'
import { isMobileMessageConfigured, postMobileMessageSms } from './mobileMessage.js'

/**
 * Provider-neutral outbound SMS for an org (T1.18).
 *
 * Every customer/employee text goes through `sendOrgSms`. It reads the org's own sender
 * (`orgs.sms_from_number`, no env fallback) and provider (`orgs.sms_provider`, default
 * `twilio`), keeps the opt-out check, then dispatches to Twilio or Mobile Message.
 *
 * `sendPlatformSms` (platform alerts, TWILIO_FROM_NUMBER) stays on Twilio in twilioSend.ts.
 */

export type SmsProvider = 'twilio' | 'mobilemessage'

export const SMS_PROVIDERS: readonly SmsProvider[] = ['twilio', 'mobilemessage'] as const

export interface SmsSendResult {
  sent: boolean
  /** Provider message id — Twilio SID or Mobile Message message_id. Stored in `twilio_sid` columns. */
  sid?: string
  skipped?: string
  error?: string
  provider?: SmsProvider
}

/** Anything unrecognised (including a pre-migration null) means Twilio, today's behaviour. */
export function parseSmsProvider(value: unknown): SmsProvider {
  return value === 'mobilemessage' ? 'mobilemessage' : 'twilio'
}

export function isSmsProviderConfigured(provider: SmsProvider): boolean {
  return provider === 'mobilemessage' ? isMobileMessageConfigured() : isTwilioConfigured()
}

export interface OrgSmsConfig {
  provider: SmsProvider
  from: string | null
}

/**
 * Read the org's SMS sender + provider. Falls back to selecting only `sms_from_number` if
 * the `sms_provider` column is missing (migration not yet applied to that database), so
 * deploying the code before the migration keeps every org on Twilio instead of breaking SMS.
 */
export async function loadOrgSmsConfig(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgSmsConfig> {
  const withProvider = await supabase
    .from('orgs')
    .select('sms_from_number, sms_provider')
    .eq('id', orgId)
    .maybeSingle()

  let row = withProvider.data as { sms_from_number?: string | null; sms_provider?: string | null } | null
  if (withProvider.error) {
    const legacy = await supabase.from('orgs').select('sms_from_number').eq('id', orgId).maybeSingle()
    row = legacy.data as { sms_from_number?: string | null } | null
  }

  return {
    provider: parseSmsProvider(row?.sms_provider),
    from: row?.sms_from_number?.trim() || null,
  }
}

/** True when this org can send SMS right now (provider credentials set + a sender number). */
export async function isOrgSmsReady(orgId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return false
  const config = await loadOrgSmsConfig(supabase, orgId)
  return Boolean(config.from) && isSmsProviderConfigured(config.provider)
}

/** Customer/employee SMS from the org's own sender, via the org's provider. */
export async function sendOrgSms(input: {
  orgId: string
  to: string
  body: string
  /** Optional caller-supplied key; Mobile Message sends always carry one. */
  idempotencyKey?: string
}): Promise<SmsSendResult> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { sent: false, error: 'Server not configured' }

  const { provider, from } = await loadOrgSmsConfig(supabase, input.orgId)
  if (!from) return { sent: false, skipped: 'no_sender_number', provider }

  const to = formatAuPhoneForSms(input.to)
  if (await isPhoneOptedOut(supabase, input.orgId, to)) {
    return { sent: false, skipped: 'opted_out', provider }
  }

  const result =
    provider === 'mobilemessage'
      ? await postMobileMessageSms({ from, to, body: input.body, idempotencyKey: input.idempotencyKey })
      : await postTwilioSms(from, to, input.body)

  return { ...result, provider }
}
