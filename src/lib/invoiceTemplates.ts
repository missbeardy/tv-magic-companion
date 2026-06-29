import { interpolateTemplate } from './brandTemplates'

export const INVOICE_EMAIL_TEMPLATE_KEY_SUBJECT = 'customer_invoice_subject'
export const INVOICE_EMAIL_TEMPLATE_KEY_HTML = 'customer_invoice_html'

export const INVOICE_TEMPLATE_PLACEHOLDERS = [
  '{{org.name}}',
  '{{customerName}}',
  '{{customerEmail}}',
  '{{invoiceNumber}}',
  '{{totalAmount}}',
  '{{dueDate}}',
  '{{lineItemsHtml}}',
  '{{paymentInstructions}}',
  '{{serviceType}}',
  '{{jobDate}}',
  '{{primaryColor}}',
  '{{senderBlock}}',
] as const

export function getDefaultInvoiceEmailTemplates(): Record<string, string> {
  return {
    [INVOICE_EMAIL_TEMPLATE_KEY_SUBJECT]: 'Invoice {{invoiceNumber}} from {{org.name}}',
    [INVOICE_EMAIL_TEMPLATE_KEY_HTML]: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <h2 style="color:{{primaryColor}}">Invoice {{invoiceNumber}}</h2>
  <p>Hi {{customerName}},</p>
  <p>Thank you for choosing {{org.name}}. Please find your invoice details below.</p>
  <p><strong>Amount due:</strong> {{totalAmount}}</p>
  <p><strong>Due date:</strong> {{dueDate}}</p>
  {{lineItemsHtml}}
  <p><strong>How to pay:</strong><br/>{{paymentInstructions}}</p>
  {{senderBlock}}
</div>`,
  }
}

export const INVOICE_EMAIL_PREVIEW_VARS = {
  'org.name': 'Sample Franchise',
  customerName: 'Jane Smith',
  customerEmail: 'jane@example.com',
  invoiceNumber: 'INV-2026-0001',
  totalAmount: 'AUD 450.00',
  dueDate: '14 July 2026',
  lineItemsHtml: '<p><strong>Line items:</strong><br/>TV wall mount — AUD 450.00</p>',
  paymentInstructions: 'Bank transfer: BSB 000-000 Acc 12345678<br/>Reference: INV-2026-0001',
  serviceType: 'TV Aerial',
  jobDate: '30 June 2026',
  senderBlock: '<p>Questions? Reply to this email.</p>',
} as const

export function buildInvoiceEmailPreview(
  subject: string,
  html: string,
  primaryColor: string
): { subject: string; html: string } {
  const vars = { ...INVOICE_EMAIL_PREVIEW_VARS, primaryColor }
  return {
    subject: interpolateTemplate(subject, vars),
    html: interpolateTemplate(html, vars),
  }
}
