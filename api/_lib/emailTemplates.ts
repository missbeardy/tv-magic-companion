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

export function interpolateHtmlTemplate(template: string, vars: TemplateVars): string {
  const RAW_HTML_KEYS = /Html$|Block$|Button$|Line$|Url$|Color$/i
  const escaped: TemplateVars = {}
  for (const [key, value] of Object.entries(vars)) {
    if (value == null) {
      escaped[key] = ''
      continue
    }
    escaped[key] = RAW_HTML_KEYS.test(key) ? value : escapeHtml(value)
  }
  return interpolateTemplate(template, escaped)
}

export function nl2brHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br/>')
}

export interface QuoteEmailContent {
  subject: string
  html: string
}

/** Org override → brand → default. Empty strings fall through. */
export function resolveEmailTemplateValue(
  orgTemplates: Record<string, string> | null | undefined,
  brandTemplates: Record<string, string> | null | undefined,
  key: string,
  defaultValue: string
): string {
  const orgVal = orgTemplates?.[key]?.trim()
  if (orgVal) return orgVal
  const brandVal = brandTemplates?.[key]?.trim()
  if (brandVal) return brandVal
  return defaultValue
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
  brandTemplates: Record<string, string> | null | undefined,
  vars: TemplateVars,
  fallbackTemplates: Record<string, string> = getDefaultQuoteEmailTemplates(),
  orgTemplates?: Record<string, string> | null
): QuoteEmailContent {
  const subjectTemplate = resolveEmailTemplateValue(
    orgTemplates,
    brandTemplates,
    QUOTE_EMAIL_TEMPLATE_KEYS.subject,
    fallbackTemplates[QUOTE_EMAIL_TEMPLATE_KEYS.subject]
  )
  const htmlTemplate = resolveEmailTemplateValue(
    orgTemplates,
    brandTemplates,
    QUOTE_EMAIL_TEMPLATE_KEYS.html,
    fallbackTemplates[QUOTE_EMAIL_TEMPLATE_KEYS.html]
  )

  return {
    subject: interpolateTemplate(subjectTemplate, vars),
    html: interpolateHtmlTemplate(htmlTemplate, vars),
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

export function buildInvoiceEmailFromOrg(
  orgTemplates: Record<string, string> | null | undefined,
  vars: TemplateVars,
  fallbackTemplates: Record<string, string> = getDefaultInvoiceEmailTemplates(),
  brandTemplates?: Record<string, string> | null
): QuoteEmailContent {
  const subjectTemplate = resolveEmailTemplateValue(
    orgTemplates,
    brandTemplates,
    INVOICE_EMAIL_TEMPLATE_KEYS.subject,
    fallbackTemplates[INVOICE_EMAIL_TEMPLATE_KEYS.subject]
  )
  const htmlTemplate = resolveEmailTemplateValue(
    orgTemplates,
    brandTemplates,
    INVOICE_EMAIL_TEMPLATE_KEYS.html,
    fallbackTemplates[INVOICE_EMAIL_TEMPLATE_KEYS.html]
  )

  return {
    subject: interpolateTemplate(subjectTemplate, vars),
    html: interpolateHtmlTemplate(htmlTemplate, vars),
  }
}
