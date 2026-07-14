import { getDefaultSmsTemplates, interpolateTemplate } from './brandTemplates'
import {
  LEAD_ACK_CALLBACK_WINDOW,
  LEAD_ACK_SMS_FALLBACK,
  LEAD_ACK_TEMPLATE_KEY,
  buildOrgPhoneLine,
} from '../../shared/leadAckCopy'

export { LEAD_ACK_TEMPLATE_KEY, LEAD_ACK_SMS_FALLBACK as LEAD_ACK_FALLBACK }

export { buildOrgPhoneLine }

export function buildLeadAckMessage(
  orgName: string,
  customerName?: string | null,
  brandTemplate?: string | null,
  supportPhone?: string | null
): string {
  const template =
    brandTemplate ??
    getDefaultSmsTemplates(orgName)[LEAD_ACK_TEMPLATE_KEY] ??
    LEAD_ACK_SMS_FALLBACK

  return interpolateTemplate(template, {
    'org.name': orgName,
    customerName: customerName?.trim() || 'there',
    'org.support_phone': supportPhone?.trim() ?? '',
    orgPhoneLine: buildOrgPhoneLine(supportPhone),
    callbackWindow: LEAD_ACK_CALLBACK_WINDOW,
  })
}
