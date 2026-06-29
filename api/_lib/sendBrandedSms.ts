import { getSupabaseAdmin } from './supabaseAdmin.js'
import { buildSmsFromBrand } from './smsTemplates.js'
import { formatAuPhoneForSms } from './phone.js'
import type { LeadEventType } from './leadEventTypes.js'

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

/** Send a branded Twilio SMS for an org and optionally log a lead timeline event. */
export async function sendBrandedSms(
  options: SendBrandedSmsOptions
): Promise<SendBrandedSmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER

  if (!sid || !token || !from) {
    return { sent: false, skipped: 'Twilio not configured' }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { sent: false, error: 'Server not configured' }
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
      ...options.vars,
    },
    options.fallbackMessage
  )

  const to = formatAuPhoneForSms(options.toPhone)
  const bodyParams = new URLSearchParams({ To: to, From: from, Body: message })
  const credentials = Buffer.from(`${sid}:${token}`).toString('base64')

  try {
    const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    })

    const twData = (await twRes.json()) as { sid?: string; message?: string }

    if (!twRes.ok) {
      console.error('Twilio branded SMS error:', twData)
      return { sent: false, error: twData.message ?? 'Twilio rejected the request' }
    }

    if (options.leadId && options.eventType) {
      await supabase.from('lead_events').insert({
        lead_id: options.leadId,
        org_id: options.orgId,
        event_type: options.eventType,
        note: options.eventNote ?? null,
        payload: {
          template: options.templateKey,
          twilio_sid: twData.sid ?? null,
          ...options.eventPayload,
        },
      })
    }

    return { sent: true, sid: twData.sid }
  } catch (err) {
    console.error('Branded SMS send failed:', err)
    return { sent: false, error: 'Failed to send SMS' }
  }
}
