import { formatAuPhoneForSms } from './phone.js'
import { isPhoneOptedOut } from './smsOptOut.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'

export interface TwilioSendResult {
  sent: boolean
  sid?: string
  skipped?: string
  error?: string
}

async function postTwilioSms(from: string, to: string, body: string): Promise<TwilioSendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) {
    return { sent: false, skipped: 'Twilio not configured' }
  }

  const bodyParams = new URLSearchParams({ To: to, From: from, Body: body })
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
      console.error('Twilio SMS error:', twData)
      return { sent: false, error: twData.message ?? 'Twilio rejected the request' }
    }
    return { sent: true, sid: twData.sid }
  } catch (err) {
    console.error('Twilio SMS send failed:', err)
    return { sent: false, error: 'Failed to send SMS' }
  }
}

/** Customer/employee SMS from the org's own sender. No env-var fallback. */
export async function sendTwilioSms(input: {
  orgId: string
  to: string
  body: string
}): Promise<TwilioSendResult> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { sent: false, error: 'Server not configured' }

  const { data: org } = await supabase
    .from('orgs')
    .select('sms_from_number')
    .eq('id', input.orgId)
    .maybeSingle()

  const from = (org?.sms_from_number as string | null | undefined)?.trim()
  if (!from) return { sent: false, skipped: 'no_sender_number' }

  const to = formatAuPhoneForSms(input.to)
  if (await isPhoneOptedOut(supabase, input.orgId, to)) {
    return { sent: false, skipped: 'opted_out' }
  }

  return postTwilioSms(from, to, input.body)
}

/** Platform-only alerts (PLATFORM_ALERT_PHONE). Uses TWILIO_FROM_NUMBER. */
export async function sendPlatformSms(input: {
  to: string
  body: string
}): Promise<TwilioSendResult> {
  const from = process.env.TWILIO_FROM_NUMBER?.trim()
  if (!from) return { sent: false, skipped: 'Twilio SMS not configured' }
  return postTwilioSms(from, formatAuPhoneForSms(input.to), input.body)
}
