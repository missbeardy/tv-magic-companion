import { interpolateTemplate } from './smsTemplates.js'

type TemplateVars = Record<string, string | undefined>

export const QUOTE_EMAIL_TEMPLATE_KEYS = {
  subject: 'customer_quote_request_subject',
  html: 'customer_quote_request_html',
} as const

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function nl2brHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br/>')
}

export interface QuoteEmailContent {
  subject: string
  html: string
}

export function getDefaultQuoteEmailTemplates(): Record<string, string> {
  return {
    [QUOTE_EMAIL_TEMPLATE_KEYS.subject]: 'Your quote from {{org.name}}',
    [QUOTE_EMAIL_TEMPLATE_KEYS.html]: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <h2 style="color:{{primaryColor}}">Your Quote Is Ready</h2>
  <p>Hi {{customerName}},</p>
  <p>{{org.name}} has prepared a quote{{serviceTypeLine}} for you to review and sign online.</p>
  <p style="margin:24px 0"><a href="{{acceptanceUrl}}" style="background:{{primaryColor}};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Review &amp; sign quote</a></p>
  <p><strong>Amount:</strong> {{totalAmount}}</p>
  {{gstLine}}
  <p><strong>Scope:</strong><br/>{{scopeHtml}}</p>
  {{termsBlock}}{{senderBlock}}
</div>`,
  }
}

export function buildQuoteEmailFromBrand(
  templates: Record<string, string> | null | undefined,
  vars: TemplateVars,
  fallbackTemplates: Record<string, string> = getDefaultQuoteEmailTemplates()
): QuoteEmailContent {
  const subjectTemplate =
    templates?.[QUOTE_EMAIL_TEMPLATE_KEYS.subject] ?? fallbackTemplates[QUOTE_EMAIL_TEMPLATE_KEYS.subject]
  const htmlTemplate =
    templates?.[QUOTE_EMAIL_TEMPLATE_KEYS.html] ?? fallbackTemplates[QUOTE_EMAIL_TEMPLATE_KEYS.html]

  return {
    subject: interpolateTemplate(subjectTemplate, vars),
    html: interpolateTemplate(htmlTemplate, vars),
  }
}

export const INVOICE_EMAIL_TEMPLATE_KEYS = {
  subject: 'customer_invoice_subject',
  html: 'customer_invoice_html',
} as const

export function getDefaultInvoiceEmailTemplates(): Record<string, string> {
  return {
    [INVOICE_EMAIL_TEMPLATE_KEYS.subject]: 'Invoice {{invoiceNumber}} from {{org.name}}',
    [INVOICE_EMAIL_TEMPLATE_KEYS.html]: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <h2 style="color:{{primaryColor}}">{{documentTitle}} {{invoiceNumber}}</h2>
  {{abnLine}}
  <p>Hi {{customerName}},</p>
  <p>Thank you for choosing {{org.name}}. Please find your invoice details below.</p>
  <p><strong>Amount due:</strong> {{totalAmount}}</p>
  {{gstLine}}
  <p><strong>Due date:</strong> {{dueDate}}</p>
  {{lineItemsHtml}}
  {{payButton}}
  <p><strong>How to pay:</strong><br/>{{paymentInstructions}}</p>
  {{senderBlock}}
</div>`,
  }
}

export const LEAD_ACK_EMAIL_TEMPLATE_KEYS = {
  subject: 'lead_ack_email_subject',
  html: 'lead_ack_email_html',
} as const

export function getDefaultLeadAckEmailTemplates(): Record<string, string> {
  return {
    [LEAD_ACK_EMAIL_TEMPLATE_KEYS.subject]: 'We received your enquiry — {{org.name}}',
    [LEAD_ACK_EMAIL_TEMPLATE_KEYS.html]: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <p>Hi {{customerName}},</p>
  <p>Thanks for contacting {{org.name}}. We've received your enquiry and will call you {{callbackWindow}}.</p>
  {{orgPhoneBlock}}
  <p>— {{org.name}}</p>
</div>`,
  }
}

export function buildLeadAckEmailFromBrand(
  templates: Record<string, string> | null | undefined,
  vars: TemplateVars,
  fallbackTemplates: Record<string, string> = getDefaultLeadAckEmailTemplates()
): QuoteEmailContent {
  const subjectTemplate =
    templates?.[LEAD_ACK_EMAIL_TEMPLATE_KEYS.subject] ??
    fallbackTemplates[LEAD_ACK_EMAIL_TEMPLATE_KEYS.subject]
  const htmlTemplate =
    templates?.[LEAD_ACK_EMAIL_TEMPLATE_KEYS.html] ??
    fallbackTemplates[LEAD_ACK_EMAIL_TEMPLATE_KEYS.html]

  return {
    subject: interpolateTemplate(subjectTemplate, vars),
    html: interpolateTemplate(htmlTemplate, vars),
  }
}

export function buildInvoiceEmailFromOrg(
  templates: Record<string, string> | null | undefined,
  vars: TemplateVars,
  fallbackTemplates: Record<string, string> = getDefaultInvoiceEmailTemplates()
): QuoteEmailContent {
  const subjectTemplate =
    templates?.[INVOICE_EMAIL_TEMPLATE_KEYS.subject] ?? fallbackTemplates[INVOICE_EMAIL_TEMPLATE_KEYS.subject]
  const htmlTemplate =
    templates?.[INVOICE_EMAIL_TEMPLATE_KEYS.html] ?? fallbackTemplates[INVOICE_EMAIL_TEMPLATE_KEYS.html]

  return {
    subject: interpolateTemplate(subjectTemplate, vars),
    html: interpolateTemplate(htmlTemplate, vars),
  }
}
