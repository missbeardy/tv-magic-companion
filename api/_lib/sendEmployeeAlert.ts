import { formatAuPhoneForSms } from './phone.js'
import type { EmployeeWhatsAppMessagePayload } from './employeeWhatsAppTemplates.js'
import {
  isEmployeeWhatsAppConfigured,
  sendEmployeeWhatsApp,
} from './sendEmployeeWhatsApp.js'

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
  body: string
): Promise<SendEmployeeAlertResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER?.trim()

  if (!sid || !token || !from) {
    return { sent: false, skipped: 'Twilio SMS not configured' }
  }

  const to = formatAuPhoneForSms(toPhone)
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
    const twData = (await twRes.json()) as { sid?: string; message?: string; code?: number }
    if (!twRes.ok) {
      console.error('Employee SMS error:', twData, { to, from })
      return {
        sent: false,
        error: twData.message ?? 'Twilio rejected the SMS request',
        code: twData.code,
      }
    }
    return { sent: true, channel: 'sms', sid: twData.sid }
  } catch (err) {
    console.error('Employee SMS send failed:', err)
    return { sent: false, error: 'Failed to send SMS message' }
  }
}

/** Try WhatsApp first; fall back to SMS with the same body text. */
export async function sendEmployeeAlertWithSmsFallback(options: {
  toPhone: string
  smsBody: string
  whatsAppMessage: EmployeeWhatsAppMessagePayload
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

  return sendEmployeeSms(options.toPhone, options.smsBody)
}

/** Best-effort employee alert — never throws. */
export async function sendEmployeeAlertToPhone(
  phone: string | null | undefined,
  smsBody: string,
  whatsAppMessage: EmployeeWhatsAppMessagePayload
): Promise<SendEmployeeAlertResult> {
  if (!phone?.trim()) {
    return { sent: false, skipped: 'No phone on profile' }
  }

  return sendEmployeeAlertWithSmsFallback({
    toPhone: phone,
    smsBody,
    whatsAppMessage,
  })
}
