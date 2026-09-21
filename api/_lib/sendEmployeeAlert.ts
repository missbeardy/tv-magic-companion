import type { EmployeeWhatsAppMessagePayload } from './employeeWhatsAppTemplates.js'
import {
  isEmployeeWhatsAppConfigured,
  sendEmployeeWhatsApp,
} from './sendEmployeeWhatsApp.js'
import { sendPlatformSms, sendTwilioSms } from './twilioSend.js'

export interface SendEmployeeAlertResult {
  sent: boolean
  channel?: 'whatsapp' | 'sms'
  sid?: string
  skipped?: string
  error?: string
  code?: number
}

/** Send a plain Twilio SMS to a team member (employee alerts fallback). */
export async function sendEmployeeSms(
  toPhone: string,
  body: string,
  orgId?: string
): Promise<SendEmployeeAlertResult> {
  const result = orgId
    ? await sendTwilioSms({ orgId, to: toPhone, body })
    : await sendPlatformSms({ to: toPhone, body })

  if (result.sent) {
    return { sent: true, channel: 'sms', sid: result.sid }
  }
  if (result.skipped === 'no_sender_number') {
    return { sent: false, skipped: 'Twilio SMS not configured' }
  }
  return { sent: false, skipped: result.skipped, error: result.error }
}

/** Try WhatsApp first; fall back to SMS with the same body text. */
export async function sendEmployeeAlertWithSmsFallback(options: {
  toPhone: string
  smsBody: string
  whatsAppMessage: EmployeeWhatsAppMessagePayload
  orgId?: string
}): Promise<SendEmployeeAlertResult> {
  if (isEmployeeWhatsAppConfigured()) {
    const waResult = await sendEmployeeWhatsApp({
      toPhone: options.toPhone,
      ...options.whatsAppMessage,
    })
    if (waResult.sent) {
      return { sent: true, channel: 'whatsapp', sid: waResult.sid }
    }
    const reason = waResult.skipped ?? waResult.error ?? 'WhatsApp send failed'
    console.warn(`Employee WhatsApp unavailable, falling back to SMS: ${reason}`, {
      toPhone: options.toPhone,
      code: waResult.code,
    })
  }

  return sendEmployeeSms(options.toPhone, options.smsBody, options.orgId)
}

/** Best-effort employee alert — never throws. */
export async function sendEmployeeAlertToPhone(
  phone: string | null | undefined,
  smsBody: string,
  whatsAppMessage: EmployeeWhatsAppMessagePayload,
  orgId?: string
): Promise<SendEmployeeAlertResult> {
  if (!phone?.trim()) {
    return { sent: false, skipped: 'No phone on profile' }
  }

  return sendEmployeeAlertWithSmsFallback({
    toPhone: phone,
    smsBody,
    whatsAppMessage,
    orgId,
  })
}
