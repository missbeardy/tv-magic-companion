import { getDefaultSmsTemplates, interpolateTemplate } from './brandTemplates'

export const MISSED_CALL_HOOKBACK_TEMPLATE_KEY = 'missed_call_hookback'

export const MISSED_CALL_HOOKBACK_FALLBACK =
  'Hi, {{customerName}} — hands full on-site at {{org.name}}. Your missed call has been assigned to one of our technicians who will call you as soon as possible.'

export function buildMissedCallHookbackMessage(
  orgName: string,
  customerName?: string | null,
  brandTemplate?: string | null
): string {
  const template =
    brandTemplate ??
    getDefaultSmsTemplates(orgName)[MISSED_CALL_HOOKBACK_TEMPLATE_KEY] ??
    MISSED_CALL_HOOKBACK_FALLBACK

  return interpolateTemplate(template, {
    'org.name': orgName,
    customerName: customerName?.trim() || 'there',
  })
}
