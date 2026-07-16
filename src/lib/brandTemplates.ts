import { LEAD_ACK_CALLBACK_WINDOW, buildOrgPhoneLine } from '../../shared/leadAckCopy'
import type { Org } from '../context/OrgContext'
import type { Brand } from './theme'

type TemplateVars = Record<string, string | undefined>

/** Interpolate {{org.name}} style placeholders in brand SMS templates */
export function interpolateTemplate(
  template: string,
  vars: TemplateVars
): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => {
    if (key.startsWith('org.')) {
      const orgKey = key.slice(4)
      return vars[`org.${orgKey}`] ?? vars[orgKey] ?? ''
    }
    return vars[key] ?? ''
  })
}

export function getSmsTemplate(
  brand: Brand | null,
  key: string,
  org: Org | null,
  extra: TemplateVars = {}
): string | null {
  const template = brand?.sms_templates?.[key]
  if (!template) return null
  return interpolateTemplate(template, {
    'org.name': org?.name,
    'org.support_phone': org?.support_phone ?? undefined,
    ...extra,
  })
}

export function getDefaultSmsTemplates(orgName: string): Record<string, string> {
  return {
    tech_assignment: `${orgName}: You've been assigned {{leadName}} — {{serviceType}}`,
    customer_ontheway: `{{techName}} from {{org.name}} is on their way. Thank you.`,
    missed_call_hookback: `Hi, {{customerName}} — hands full on-site at {{org.name}}. Your missed call has been assigned to one of our technicians who will call you as soon as possible.`,
    lead_ack_sms: `Hi {{customerName}}, thanks for contacting {{org.name}}. We've received your enquiry and we'll call you {{callbackWindow}}.{{orgPhoneLine}}`,
    customer_review_request: `Hi {{customerName}}, thanks for choosing ${orgName}! We'd love your feedback: {{reviewUrl}}`,
    booking_scheduled: `${orgName}: {{managerName}} scheduled "{{leadName}}" on your calendar — {{dateTime}}. Open: {{appUrl}}`,
    receipt_footer: `— ${orgName} Team`,
    invoice_chase_stage_1: "Hi {{firstName}}, a reminder from {{org.name}} — invoice {{invoiceNumber}} for {{amount}} was due on {{dueDate}}. If you've already paid, ignore this. Any questions, just reply.",
    invoice_chase_stage_2: 'Hi {{firstName}}, invoice {{invoiceNumber}} for {{amount}} from {{org.name}} is now {{daysOverdue}} days overdue. Reply here or call us to sort it out.',
    invoice_chase_stage_3: 'Hi {{firstName}}, invoice {{invoiceNumber}} for {{amount}} from {{org.name}} is now {{daysOverdue}} days overdue. Please reply or call us so we can help resolve this.',
    quote_chase_stage_1: "Hi {{firstName}}, {{org.name}} here — just checking you got the quote for {{jobService}}. View or accept it here: {{link}}. Any questions, reply and I'll sort it.",
    quote_chase_stage_2: "Hi {{firstName}}, that quote for {{jobService}} is still open if you'd like it: {{link}}. If the timing's not right, no worries — reply and let me know either way.",
    customer_quote_link: `Hi {{customerName}}, here's your quote from {{org.name}} for {{serviceType}}: {{acceptanceUrl}}`,
    customer_booking_confirm: `Hi {{customerName}}, {{org.name}} booked you in for {{dateTime}}.{{techLine}} See you then!`,
    customer_booking_reminder: `Hi {{customerName}}, just a reminder — your {{serviceType}} appointment with {{org.name}} is tomorrow, {{dateTime}}.{{techLine}} See you then!`,
    manager_alert: `${orgName}: A new lead has been submitted — {{leadName}} ({{serviceType}}). Please review and assign a technician: {{appUrl}}`,
  }
}

/** SMS templates editable per brand in Platform Admin. */
export const EDITABLE_SMS_TEMPLATE_KEYS = [
  'lead_ack_sms',
  'missed_call_hookback',
  'manager_alert',
  'customer_ontheway',
  'customer_review_request',
  'customer_booking_reminder',
] as const

export type EditableSmsTemplateKey = (typeof EDITABLE_SMS_TEMPLATE_KEYS)[number]

export const SMS_TEMPLATE_META: Record<
  EditableSmsTemplateKey,
  { label: string; description: string; placeholders: string[] }
> = {
  lead_ack_sms: {
    label: 'Lead acknowledgement SMS',
    description: 'Instant thank-you SMS when a new inbound lead is created (requires Lead Acknowledgement SMS switch).',
    placeholders: ['{{customerName}}', '{{org.name}}', '{{callbackWindow}}', '{{orgPhoneLine}}'],
  },
  missed_call_hookback: {
    label: 'Missed call auto-reply SMS',
    description: 'Sent when a voicemail/missed-call lead is created (requires Missed Call Auto-Reply switch).',
    placeholders: ['{{customerName}}', '{{org.name}}'],
  },
  manager_alert: {
    label: 'Manager new-lead alert SMS',
    description: 'WhatsApp/SMS to managers when an unassigned lead arrives (requires Manager New-Lead Alert switch).',
    placeholders: ['{{org.name}}', '{{leadName}}', '{{serviceType}}', '{{appUrl}}'],
  },
  customer_ontheway: {
    label: 'Customer on-the-way SMS',
    description: 'Pre-filled ETA message when a technician taps Send ETA SMS on a lead.',
    placeholders: ['{{techName}}', '{{org.name}}'],
  },
  customer_review_request: {
    label: 'Google review request SMS',
    description: 'Post-job review link SMS (requires Review Requests switch + Google Review URL in org settings).',
    placeholders: ['{{customerName}}', '{{org.name}}', '{{reviewUrl}}'],
  },
  customer_booking_reminder: {
    label: 'Day-before booking reminder SMS',
    description: 'Automatic SMS sent roughly 24 hours before a booked appointment (requires Day-Before Booking Reminder switch).',
    placeholders: ['{{customerName}}', '{{org.name}}', '{{dateTime}}', '{{techLine}}', '{{serviceType}}'],
  },
}

const SMS_PREVIEW_SAMPLE = {
  'org.name': 'Sample Franchise',
  customerName: 'Jane Smith',
  callbackWindow: LEAD_ACK_CALLBACK_WINDOW,
  orgPhoneLine: buildOrgPhoneLine('0412 345 678'),
  leadName: 'Jane Smith',
  serviceType: 'TV Wall Mount',
  appUrl: 'https://example.com/leads',
  techName: 'Alex',
  reviewUrl: 'https://g.page/r/example/review',
  firstName: 'Jane',
  dateTime: 'Thu 17 Jul, 9:00am',
  techLine: ' Your technician is Alex.',
} as const

export function buildSmsTemplatePreview(
  key: EditableSmsTemplateKey,
  template: string,
  brandName: string
): string {
  const defaults = getDefaultSmsTemplates(brandName)
  const vars = { ...SMS_PREVIEW_SAMPLE, 'org.name': brandName }
  return interpolateTemplate(template || defaults[key] || '', vars)
}

export function resolveSmsTemplateDefault(key: EditableSmsTemplateKey, brandName: string): string {
  return getDefaultSmsTemplates(brandName)[key] ?? ''
}

export function isSmsTemplatesCustom(
  smsTemplates: Record<string, string>,
  brandName: string
): boolean {
  const defaults = getDefaultSmsTemplates(brandName)
  return EDITABLE_SMS_TEMPLATE_KEYS.some(
    (key) => (smsTemplates[key] ?? defaults[key]) !== defaults[key]
  )
}

export const QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT = 'customer_quote_request_subject'
export const QUOTE_EMAIL_TEMPLATE_KEY_HTML = 'customer_quote_request_html'
export const LEAD_ACK_EMAIL_SUBJECT_KEY = 'lead_ack_email_subject'
export const LEAD_ACK_EMAIL_HTML_KEY = 'lead_ack_email_html'

export function getDefaultEmailTemplates(): Record<string, string> {
  return {
    [QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT]: 'Your quote from {{org.name}}',
    [QUOTE_EMAIL_TEMPLATE_KEY_HTML]: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <h2 style="color:{{primaryColor}}">Your Quote Is Ready</h2>
  <p>Hi {{customerName}},</p>
  <p>{{org.name}} has prepared a quote{{serviceTypeLine}} for you to review and sign online.</p>
  <p style="margin:24px 0"><a href="{{acceptanceUrl}}" style="background:{{primaryColor}};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Review &amp; sign quote</a></p>
  <p><strong>Amount:</strong> {{totalAmount}}</p>
  <p><strong>Scope:</strong><br/>{{scopeHtml}}</p>
  {{termsBlock}}{{senderBlock}}
</div>`,
    lead_ack_email_subject: 'We received your enquiry — {{org.name}}',
    lead_ack_email_html: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <p>Hi {{customerName}},</p>
  <p>Thanks for contacting {{org.name}}. We've received your enquiry and will call you {{callbackWindow}}.</p>
  {{orgPhoneBlock}}
  <p>— {{org.name}}</p>
</div>`,
  }
}

export function hasQuoteEmailTemplate(brand: Brand | null): boolean {
  const templates = brand?.email_templates
  return Boolean(
    templates?.[QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT] && templates?.[QUOTE_EMAIL_TEMPLATE_KEY_HTML]
  )
}

export const QUOTE_EMAIL_PREVIEW_VARS = {
  'org.name': 'Sample Franchise',
  customerName: 'Jane Smith',
  acceptanceUrl: 'https://example.com/quote/sample-token',
  totalAmount: 'AUD 450.00',
  serviceTypeLine: ' for TV Aerial',
  scopeHtml: 'Wall-mount 65" TV<br/>Conceal cables',
  termsBlock: '<p><strong>Terms:</strong><br/>50% deposit required.</p>',
  senderBlock: '<p>Prepared by: Alex Manager</p>',
} as const

export function buildQuoteEmailPreview(
  subject: string,
  html: string,
  primaryColor: string
): { subject: string; html: string } {
  const vars = { ...QUOTE_EMAIL_PREVIEW_VARS, primaryColor }
  return {
    subject: interpolateTemplate(subject, vars),
    html: interpolateTemplate(html, vars),
  }
}

export const LEAD_ACK_EMAIL_PREVIEW_VARS = {
  'org.name': 'Sample Franchise',
  customerName: 'Jane Smith',
  callbackWindow: LEAD_ACK_CALLBACK_WINDOW,
  orgPhoneBlock: '<p>Need us urgently? Call <a href="tel:0412345678">0412 345 678</a>.</p>',
} as const

export function buildLeadAckEmailPreview(
  subject: string,
  html: string,
  brandName: string
): { subject: string; html: string } {
  const vars = { ...LEAD_ACK_EMAIL_PREVIEW_VARS, 'org.name': brandName }
  return {
    subject: interpolateTemplate(subject, vars),
    html: interpolateTemplate(html, vars),
  }
}
