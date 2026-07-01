export type EmployeeWhatsAppTemplateKey =
  | 'tech_assignment'
  | 'manager_alert'
  | 'booking_scheduled'
  | 'contact_follow_up'
  | 'generic_notify'

const CONTENT_SID_ENV: Record<EmployeeWhatsAppTemplateKey, string> = {
  tech_assignment: 'TWILIO_WHATSAPP_CONTENT_SID_ASSIGNMENT',
  manager_alert: 'TWILIO_WHATSAPP_CONTENT_SID_MANAGER_ALERT',
  booking_scheduled: 'TWILIO_WHATSAPP_CONTENT_SID_BOOKING',
  contact_follow_up: 'TWILIO_WHATSAPP_CONTENT_SID_FOLLOW_UP',
  generic_notify: 'TWILIO_WHATSAPP_CONTENT_SID_NOTIFY',
}

/**
 * Approved WhatsApp templates use numbered variables {{1}}, {{2}}, …
 * ContentVariables must be JSON: {"1":"value","2":"value"}
 *
 * Template examples (create these in Twilio Content Template Builder):
 * - assignment:  {{1}}: You've been assigned {{2}} — {{3}}. Open: {{4}}
 * - manager:     {{1}}: New lead {{2}} ({{3}}). Assign: {{4}}
 * - follow-up:   {{1}}: {{2}} — {{3}}
 * - booking:     {{1}}: {{2}} scheduled "{{3}}" — {{4}}. Open: {{5}}
 */
export function getEmployeeWhatsAppContentSid(key: EmployeeWhatsAppTemplateKey): string | undefined {
  const sid = process.env[CONTENT_SID_ENV[key]]?.trim()
  return sid || undefined
}

export function buildNumberedContentVariables(
  values: string[]
): Record<string, string> {
  const out: Record<string, string> = {}
  values.forEach((value, index) => {
    out[String(index + 1)] = value
  })
  return out
}

export interface EmployeeWhatsAppMessagePayload {
  body: string
  contentSid?: string
  contentVariables?: Record<string, string>
}

export function buildEmployeeWhatsAppMessage(
  key: EmployeeWhatsAppTemplateKey,
  fallbackBody: string,
  vars: Record<string, string>
): EmployeeWhatsAppMessagePayload {
  const contentSid = getEmployeeWhatsAppContentSid(key)
  if (!contentSid) {
    return { body: fallbackBody }
  }

  let contentVariables: Record<string, string>

  switch (key) {
    case 'tech_assignment':
      contentVariables = buildNumberedContentVariables([
        vars.orgName ?? '',
        vars.leadName ?? '',
        vars.serviceType ?? '',
        vars.appUrl ?? '',
      ])
      break
    case 'manager_alert':
      contentVariables = buildNumberedContentVariables([
        vars.orgName ?? '',
        vars.leadName ?? '',
        vars.serviceType ?? '',
        vars.appUrl ?? '',
      ])
      break
    case 'booking_scheduled':
      contentVariables = buildNumberedContentVariables([
        vars.orgName ?? '',
        vars.managerName ?? '',
        vars.leadName ?? '',
        vars.dateTime ?? '',
        vars.appUrl ?? '',
      ])
      break
    case 'contact_follow_up':
    case 'generic_notify':
      contentVariables = buildNumberedContentVariables([
        vars.title ?? '',
        vars.message ?? '',
        vars.url ?? '',
      ])
      break
    default:
      return { body: fallbackBody }
  }

  return { body: fallbackBody, contentSid, contentVariables }
}

/** Map internal send-sms mode to template key. */
export function whatsAppTemplateKeyForMode(
  mode: string
): EmployeeWhatsAppTemplateKey | null {
  if (mode === 'tech_assignment') return 'tech_assignment'
  if (mode === 'manager_alert') return 'manager_alert'
  if (mode === 'booking_scheduled') return 'booking_scheduled'
  return null
}
