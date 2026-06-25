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
    customer_ontheway: `{{techName}} from ${orgName} is on their way to help with your {{serviceType}} enquiry.`,
    missed_call_hookback: `Hi, {{customerName}} — hands full on-site at {{org.name}}. Your missed call has been assigned to one of our technicians who will call you as soon as possible.`,
    customer_review_request: `Hi {{customerName}}, thanks for choosing ${orgName}! We'd love your feedback: {{reviewUrl}}`,
    receipt_footer: `— ${orgName} Team`,
  }
}

export const QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT = 'customer_quote_request_subject'
export const QUOTE_EMAIL_TEMPLATE_KEY_HTML = 'customer_quote_request_html'

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
