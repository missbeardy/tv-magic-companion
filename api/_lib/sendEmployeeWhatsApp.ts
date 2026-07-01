import { formatAuPhoneForSms } from './phone.js'

export interface SendEmployeeWhatsAppOptions {
  toPhone: string
  body: string
  /** Twilio Content template SID (required for business-initiated outside 24h window). */
  contentSid?: string
  contentVariables?: Record<string, string>
}

export interface SendEmployeeWhatsAppResult {
  sent: boolean
  sid?: string
  skipped?: string
  error?: string
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
  const bodyParams = new URLSearchParams({ To: to, From: from })

  if (options.contentSid) {
    bodyParams.set('ContentSid', options.contentSid)
    if (options.contentVariables && Object.keys(options.contentVariables).length > 0) {
      bodyParams.set('ContentVariables', JSON.stringify(options.contentVariables))
    }
  } else {
    bodyParams.set('Body', options.body)
  }

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
      console.error('Twilio WhatsApp error:', twData)
      return { sent: false, error: twData.message ?? 'Twilio rejected the WhatsApp request' }
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
  title: string,
  message: string,
  url?: string
): Promise<SendEmployeeWhatsAppResult> {
  if (!phone?.trim()) {
    return { sent: false, skipped: 'No phone on profile' }
  }

  const body = url ? `${title}\n\n${message}\n\n${url}` : `${title}\n\n${message}`
  return sendEmployeeWhatsApp({ toPhone: phone, body })
}
