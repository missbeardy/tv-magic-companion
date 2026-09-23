import { getSupabaseAdmin } from './supabaseAdmin.js'
import { buildSmsFromBrand } from './smsTemplates.js'
import { formatAuPhoneForSms } from './phone.js'
import type { LeadEventType } from './leadEventTypes.js'
import { LEAD_ACK_CALLBACK_WINDOW } from '../../shared/leadAckCopy.js'
import { isPhoneOptedOut } from './smsOptOut.js'
import { sendOrgSms } from './smsSend.js'

export interface SendBrandedSmsOptions {
  orgId: string
  toPhone: string
  templateKey: string
  vars: Record<string, string>
  fallbackMessage: string
  leadId?: string
  eventType?: LeadEventType
  eventNote?: string
  eventPayload?: Record<string, unknown>
}

export interface SendBrandedSmsResult {
  sent: boolean
  sid?: string
  skipped?: string
  error?: string
}

/** Send a branded SMS (org's provider) for an org and optionally log a lead timeline event. */
export async function sendBrandedSms(
  options: SendBrandedSmsOptions
): Promise<SendBrandedSmsResult> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { sent: false, error: 'Server not configured' }
  }

  const to = formatAuPhoneForSms(options.toPhone)
  if (await isPhoneOptedOut(supabase, options.orgId, to)) {
    return { sent: false, skipped: 'opted_out' }
  }

  const { data: org } = await supabase
    .from('orgs')
    .select('name, brand_id, support_phone')
    .eq('id', options.orgId)
    .single()

  const supportPhone = org?.support_phone?.trim() ?? ''
  const orgPhoneLine = supportPhone ? ` Need us urgently? Call ${supportPhone}.` : ''

  let smsTemplates: Record<string, string> | undefined
  if (org?.brand_id) {
    const { data: brandRow } = await supabase
      .from('brands')
      .select('sms_templates')
      .eq('id', org.brand_id)
      .maybeSingle()
    smsTemplates = brandRow?.sms_templates as Record<string, string> | undefined
  }

  const message = buildSmsFromBrand(
    smsTemplates,
    options.templateKey,
    {
      'org.name': org?.name ?? 'Your organisation',
      'org.support_phone': supportPhone,
      orgPhoneLine,
      callbackWindow: options.vars.callbackWindow ?? LEAD_ACK_CALLBACK_WINDOW,
      ...options.vars,
    },
    options.fallbackMessage
  )

  const sendResult = await sendOrgSms({ orgId: options.orgId, to, body: message })
  if (!sendResult.sent) return sendResult

  if (options.leadId && options.eventType) {
    await supabase.from('lead_events').insert({
      lead_id: options.leadId,
      org_id: options.orgId,
      event_type: options.eventType,
      note: options.eventNote ?? null,
      payload: {
        template: options.templateKey,
        twilio_sid: sendResult.sid ?? null,
        sms_provider: sendResult.provider ?? null,
        ...options.eventPayload,
      },
    })
  }

  return sendResult
}
