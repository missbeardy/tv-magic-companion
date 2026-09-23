import type { SupabaseClient } from '@supabase/supabase-js'
import { formatAuPhoneForSms, phoneCandidates } from './phone.js'
import { maskPhone } from './redact.js'
import { log } from './log.js'

const STOP_RE = /^(stop|stopall|unsubscribe|cancel|end|quit|opt ?out)$/i
const START_RE = /^(start|unstop)$/i
const YES_RE = /^yes$/i

export type SmsOptOutCommand = 'stop' | 'start' | 'yes'

export function matchSmsOptOutCommand(text: string): SmsOptOutCommand | null {
  const trimmed = text.trim()
  if (STOP_RE.test(trimmed)) return 'stop'
  if (START_RE.test(trimmed)) return 'start'
  if (YES_RE.test(trimmed)) return 'yes'
  return null
}

export async function isPhoneOptedOut(
  supabase: SupabaseClient,
  orgId: string,
  phone: string
): Promise<boolean> {
  const normalised = formatAuPhoneForSms(phone)
  if (!normalised) return false
  const { data } = await supabase
    .from('sms_opt_outs')
    .select('phone')
    .eq('org_id', orgId)
    .eq('phone', normalised)
    .maybeSingle()
  return Boolean(data)
}

async function findLeadsByPhone(
  supabase: SupabaseClient,
  orgId: string,
  fromNumber: string
): Promise<string[]> {
  const { data } = await supabase
    .from('leads')
    .select('id')
    .eq('org_id', orgId)
    .in('phone', phoneCandidates(fromNumber))
    .is('deleted_at', null)
  return (data ?? []).map((row) => row.id as string)
}

/**
 * Suppress a number for an org and note it on that number's leads. Shared by a Twilio STOP
 * reply and a Mobile Message `type: "unsubscribe"` webhook, so both providers' opt-out lists
 * land in the one table every send checks (`isPhoneOptedOut`).
 */
export async function recordSmsOptOut(input: {
  supabase: SupabaseClient
  orgId: string
  fromNumber: string
  source: string
  note: string
}): Promise<void> {
  const phone = formatAuPhoneForSms(input.fromNumber)

  await input.supabase.from('sms_opt_outs').upsert(
    {
      org_id: input.orgId,
      phone,
      source: input.source,
      opted_out_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,phone' }
  )

  const leadIds = await findLeadsByPhone(input.supabase, input.orgId, input.fromNumber)
  if (leadIds.length > 0) {
    await input.supabase.from('lead_events').insert(
      leadIds.map((leadId) => ({
        lead_id: leadId,
        org_id: input.orgId,
        event_type: 'sms_opt_out',
        note: input.note,
        payload: { from: input.fromNumber, phone, source: input.source },
      }))
    )
  }

  log.info('[SMS_OPT_OUT]', { orgId: input.orgId, phone: maskPhone(phone), source: input.source })
}

/**
 * Handle STOP / START / YES before inbound SMS creates a lead.
 * `yes` only opts back in when a suppression row already exists, so a customer
 * replying "yes" to an ack is not dropped as a START command.
 */
export async function applyInboundSmsOptOut(input: {
  supabase: SupabaseClient
  orgId: string
  fromNumber: string
  smsText: string
}): Promise<'handled' | 'ignored'> {
  const command = matchSmsOptOutCommand(input.smsText)
  if (!command) return 'ignored'

  const phone = formatAuPhoneForSms(input.fromNumber)

  if (command === 'stop') {
    await recordSmsOptOut({
      supabase: input.supabase,
      orgId: input.orgId,
      fromNumber: input.fromNumber,
      source: 'inbound_sms',
      note: 'Customer replied STOP',
    })
    return 'handled'
  }

  const optedOut = await isPhoneOptedOut(input.supabase, input.orgId, phone)
  if (command === 'yes' && !optedOut) return 'ignored'

  await input.supabase.from('sms_opt_outs').delete().eq('org_id', input.orgId).eq('phone', phone)
  log.info('[SMS_OPT_IN]', { orgId: input.orgId, phone: maskPhone(phone) })
  return 'handled'
}
