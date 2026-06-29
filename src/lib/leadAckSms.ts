import { getDefaultSmsTemplates, interpolateTemplate } from './brandTemplates'

export const LEAD_ACK_TEMPLATE_KEY = 'lead_ack_sms'

export const LEAD_ACK_FALLBACK =
  "Hi {{customerName}}, thanks for contacting {{org.name}}. We've received your enquiry and will be in touch soon.{{orgPhoneLine}}"

export function buildOrgPhoneLine(supportPhone?: string | null): string {
  const phone = supportPhone?.trim()
  if (!phone) return ''
  return ` Need us urgently? Call ${phone}.`
}

export function buildLeadAckMessage(
  orgName: string,
  customerName?: string | null,
  brandTemplate?: string | null,
  supportPhone?: string | null
): string {
  const template =
    brandTemplate ??
    getDefaultSmsTemplates(orgName)[LEAD_ACK_TEMPLATE_KEY] ??
    LEAD_ACK_FALLBACK

  return interpolateTemplate(template, {
    'org.name': orgName,
    customerName: customerName?.trim() || 'there',
    'org.support_phone': supportPhone?.trim() ?? '',
    orgPhoneLine: buildOrgPhoneLine(supportPhone),
  })
}
