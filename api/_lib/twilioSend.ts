import { formatAuPhoneForSms } from './phone.js'

/**
 * Twilio transport. Org SMS goes through `sendOrgSms` in ./smsSend.ts, which picks Twilio or
 * Mobile Message per `orgs.sms_provider` (T1.18) and calls `postTwilioSms` for Twilio orgs.
 */

export interface TwilioSendResult {
  sent: boolean
  sid?: string
  skipped?: string
  error?: string
}

export function isTwilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim())
}

export async function postTwilioSms(from: string, to: string, body: string): Promise<TwilioSendResult> {
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

/**
 * Platform-only alerts (PLATFORM_ALERT_PHONE). Uses TWILIO_FROM_NUMBER.
 * Stays on Twilio for now (T1.18): it has no org, so no `orgs.sms_provider` to read.
 */
export async function sendPlatformSms(input: {
  to: string
  body: string
}): Promise<TwilioSendResult> {
  const from = process.env.TWILIO_FROM_NUMBER?.trim()
  if (!from) return { sent: false, skipped: 'Twilio SMS not configured' }
  return postTwilioSms(from, formatAuPhoneForSms(input.to), input.body)
}
