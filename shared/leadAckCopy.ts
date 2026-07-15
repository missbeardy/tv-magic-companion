/** Shared lead acknowledgement copy — used by API and client template previews. */

export const LEAD_ACK_TEMPLATE_KEY = 'lead_ack_sms'

export const LEAD_ACK_EMAIL_SUBJECT_KEY = 'lead_ack_email_subject'
export const LEAD_ACK_EMAIL_HTML_KEY = 'lead_ack_email_html'

export const LEAD_ACK_CALLBACK_WINDOW = 'within 2 business hours'

export const LEAD_ACK_SMS_FALLBACK =
  "Hi {{customerName}}, thanks for contacting {{org.name}}. We've received your enquiry and we'll call you {{callbackWindow}}.{{orgPhoneLine}}"

export function buildOrgPhoneLine(supportPhone?: string | null): string {
  const phone = supportPhone?.trim()
  if (!phone) return ''
  return ` Need us urgently? Call ${phone}.`
}
