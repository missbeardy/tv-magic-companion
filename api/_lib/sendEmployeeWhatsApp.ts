import { formatAuPhoneForSms } from './phone.js'
import type { EmployeeWhatsAppMessagePayload } from './employeeWhatsAppTemplates.js'
import { isStaticAssignmentWhatsAppTemplate } from './employeeWhatsAppTemplates.js'

export interface SendEmployeeWhatsAppOptions {
  toPhone: string
  body: string
  /** Twilio Content template SID (required for business-initiated WhatsApp). */
  contentSid?: string
  contentVariables?: Record<string, string>
}

export type { EmployeeWhatsAppMessagePayload }

export function applyEmployeeWhatsAppMessage(
  options: Omit<SendEmployeeWhatsAppOptions, 'contentSid' | 'contentVariables' | 'body'> & {
    message: EmployeeWhatsAppMessagePayload
  }
): SendEmployeeWhatsAppOptions {
  return {
    toPhone: options.toPhone,
    body: options.message.body,
    contentSid: options.message.contentSid,
    contentVariables: options.message.contentVariables,
  }
}

export interface SendEmployeeWhatsAppResult {
  sent: boolean
  sid?: string
  skipped?: string
  error?: string
  code?: number
  contentSid?: string
  contentVariables?: Record<string, string>
}

export function formatWhatsAppAddress(phone: string): string {
  const e164 = formatAuPhoneForSms(phone)
  return e164.startsWith('whatsapp:') ? e164 : `whatsapp:${e164}`
}

/** Strip whatsapp:/whatspp: prefixes and return E.164 (+digits). */
export function parseWhatsAppPhoneNumber(input: string): string | null {
  let value = input.trim()
  while (/^(?:whatsapp|whatspp):/i.test(value)) {
    value = value.replace(/^(?:whatsapp|whatspp):/i, '').trim()
  }
  const e164 = formatAuPhoneForSms(value)
  return e164.startsWith('+') ? e164 : null
}

export function getWhatsAppFromNumber(): string | null {
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim()
  if (!from) return null
  const e164 = parseWhatsAppPhoneNumber(from)
  if (!e164) return null
  return `whatsapp:${e164}`
}

export function isEmployeeWhatsAppConfigured(): boolean {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  return Boolean(sid && token && getWhatsAppFromNumber())
}

function buildTwilioMessageBody(
  from: string,
  to: string,
  options: Pick<SendEmployeeWhatsAppOptions, 'body' | 'contentSid' | 'contentVariables'>
): URLSearchParams {
  const bodyParams = new URLSearchParams({ To: to, From: from })

  if (options.contentSid) {
    bodyParams.set('ContentSid', options.contentSid)
    if (options.contentVariables && Object.keys(options.contentVariables).length > 0) {
      bodyParams.set('ContentVariables', JSON.stringify(options.contentVariables))
    }
  } else {
    bodyParams.set('Body', options.body)
  }

  return bodyParams
}

async function postTwilioWhatsApp(
  sid: string,
  token: string,
  bodyParams: URLSearchParams
): Promise<{ ok: boolean; data: { sid?: string; message?: string; code?: number } }> {
  const credentials = Buffer.from(`${sid}:${token}`).toString('base64')
  const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  })
  const twData = (await twRes.json()) as { sid?: string; message?: string; code?: number }
  return { ok: twRes.ok, data: twData }
}

/** Send a WhatsApp message to a team member via Twilio (not SMS). */
export async function sendEmployeeWhatsApp(
  options: SendEmployeeWhatsAppOptions
): Promise<SendEmployeeWhatsAppResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = getWhatsAppFromNumber()

  if (!sid || !token || !from) {
    return { sent: false, skipped: 'Twilio WhatsApp not configured' }
  }

  const to = formatWhatsAppAddress(options.toPhone)

  // Belt-and-suspenders: static templates must not send ContentVariables (Twilio 21656).
  const sendOptions =
    isStaticAssignmentWhatsAppTemplate() && options.contentSid
      ? { ...options, contentVariables: undefined }
      : options

  const bodyParams = buildTwilioMessageBody(from, to, sendOptions)

  try {
    let { ok, data: twData } = await postTwilioWhatsApp(sid, token, bodyParams)

    // Static templates (no {{n}}) reject ContentVariables with 21656 — retry ContentSid only.
    if (
      !ok &&
      twData.code === 21656 &&
      sendOptions.contentSid &&
      sendOptions.contentVariables &&
      Object.keys(sendOptions.contentVariables).length > 0
    ) {
      console.warn('Twilio 21656 on ContentVariables — retrying ContentSid only', {
        contentSid: sendOptions.contentSid,
        contentVariables: sendOptions.contentVariables,
      })
      const retryParams = buildTwilioMessageBody(from, to, {
        body: sendOptions.body,
        contentSid: sendOptions.contentSid,
      })
      const retry = await postTwilioWhatsApp(sid, token, retryParams)
      ok = retry.ok
      twData = retry.data
    }

    if (!ok) {
      console.error('Twilio WhatsApp error:', twData, {
        contentSid: options.contentSid,
        contentVariables: options.contentVariables,
        to,
        from,
      })
      return {
        sent: false,
        error: twData.message ?? 'Twilio rejected the WhatsApp request',
        code: twData.code,
        contentSid: sendOptions.contentSid,
        contentVariables: sendOptions.contentVariables,
      }
    }

    return { sent: true, sid: twData.sid }
  } catch (err) {
    console.error('Employee WhatsApp send failed:', err)
    return { sent: false, error: 'Failed to send WhatsApp message' }
  }
}

/** Best-effort WhatsApp to a profile phone — never throws. */
export async function sendEmployeeWhatsAppToPhone(
  phone: string | null | undefined,
  message: EmployeeWhatsAppMessagePayload
): Promise<SendEmployeeWhatsAppResult> {
  if (!phone?.trim()) {
    return { sent: false, skipped: 'No phone on profile' }
  }

  return sendEmployeeWhatsApp(
    applyEmployeeWhatsAppMessage({
      toPhone: phone,
      message,
    })
  )
}
