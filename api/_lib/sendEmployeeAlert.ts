import { sendOrgSms } from './smsSend.js'
import { sendPlatformSms } from './twilioSend.js'

/**
 * Employee alerts are SMS only. Employee WhatsApp was deleted in T1.18 (owner decision
 * 23-09-2026): it had been kill-switched off and was the only thing tying us to Twilio.
 */
export interface SendEmployeeAlertResult {
  sent: boolean
  channel?: 'sms'
  sid?: string
  skipped?: string
  error?: string
}

/**
 * SMS a team member. With an org, it goes from that org's own number via its provider
 * (`sendOrgSms`); without one it is a platform alert on TWILIO_FROM_NUMBER.
 */
export async function sendEmployeeSms(
  toPhone: string,
  body: string,
  orgId?: string
): Promise<SendEmployeeAlertResult> {
  const result = orgId
    ? await sendOrgSms({ orgId, to: toPhone, body })
    : await sendPlatformSms({ to: toPhone, body })

  if (result.sent) {
    return { sent: true, channel: 'sms', sid: result.sid }
  }
  if (result.skipped === 'no_sender_number') {
    return { sent: false, skipped: 'SMS not configured' }
  }
  return { sent: false, skipped: result.skipped, error: result.error }
}

/** Best-effort employee alert — never throws. */
export async function sendEmployeeAlertToPhone(
  phone: string | null | undefined,
  smsBody: string,
  orgId?: string
): Promise<SendEmployeeAlertResult> {
  if (!phone?.trim()) {
    return { sent: false, skipped: 'No phone on profile' }
  }

  try {
    return await sendEmployeeSms(phone, smsBody, orgId)
  } catch (err) {
    console.error('Employee alert failed:', err)
    return { sent: false, error: 'Failed to send SMS' }
  }
}
