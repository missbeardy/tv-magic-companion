/** Simple franchise email templates — one body + optional CTA; system fields appended per type. */

export type EmailTemplateId = 'quote' | 'lead_ack' | 'invoice'

/** Editable franchise email document (simple one-window model). */
export interface EmailTemplateDoc {
  version: 2
  subject: string
  /** Optional heading above the body */
  heading: string
  /** Main message — plain text; newlines become line breaks; {{placeholders}} allowed */
  body: string
  /** CTA button label; empty = no button */
  buttonLabel: string
  /** CTA href (usually a {{placeholder}}); ignored if buttonLabel empty */
  buttonHref: string
  showLogo: boolean
}

/** Legacy block docs from the first builder — still readable for migration. */
type LegacyEmailBlock =
  | { id: string; type: 'logo' }
  | { id: string; type: 'heading'; text: string; color?: string }
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'button'; label: string; href: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; size?: 'sm' | 'md' | 'lg' }
  | { id: string; type: 'dynamic'; key: string }

interface LegacyEmailTemplateDoc {
  version: 1
  subject: string
  blocks: LegacyEmailBlock[]
}

export type EmailTemplateDocsMap = Partial<Record<EmailTemplateId, EmailTemplateDoc>>

export const EMAIL_TEMPLATE_IDS: EmailTemplateId[] = ['quote', 'lead_ack', 'invoice']

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateId, string> = {
  quote: 'Quote email',
  lead_ack: 'Lead acknowledgement',
  invoice: 'Invoice email',
}

export const EMAIL_TEMPLATE_STORAGE_KEYS: Record<
  EmailTemplateId,
  { subject: string; html: string }
> = {
  quote: {
    subject: 'customer_quote_request_subject',
    html: 'customer_quote_request_html',
  },
  lead_ack: {
    subject: 'lead_ack_email_subject',
    html: 'lead_ack_email_html',
  },
  invoice: {
    subject: 'customer_invoice_subject',
    html: 'customer_invoice_html',
  },
}

/** Placeholders franchisees can insert into subject/body (customer-facing copy). */
export const EMAIL_TEMPLATE_PLACEHOLDERS: Record<EmailTemplateId, string[]> = {
  quote: [
    '{{org.name}}',
    '{{customerName}}',
    '{{serviceTypeLine}}',
    '{{totalAmount}}',
    '{{acceptanceUrl}}',
  ],
  lead_ack: ['{{org.name}}', '{{customerName}}', '{{callbackWindow}}'],
  invoice: [
    '{{org.name}}',
    '{{customerName}}',
    '{{invoiceNumber}}',
    '{{documentTitle}}',
    '{{totalAmount}}',
    '{{dueDate}}',
    '{{paymentInstructions}}',
  ],
}

/** Auto-appended after the franchise body — not edited as separate blocks. */
const TEMPLATE_FOOTER_HTML: Record<EmailTemplateId, string> = {
  quote: `{{gstLine}}
  <p><strong>Scope:</strong><br/>{{scopeHtml}}</p>
  {{termsBlock}}{{senderBlock}}`,
  lead_ack: `{{orgPhoneBlock}}`,
  invoice: `{{abnLine}}
  {{gstLine}}
  {{lineItemsHtml}}
  {{payButton}}
  {{senderBlock}}`,
}

const DEFAULT_BUTTON_HREF: Record<EmailTemplateId, string> = {
  quote: '{{acceptanceUrl}}',
  lead_ack: '',
  invoice: '',
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeKeepingPlaceholders(text: string): string {
  const parts = text.split(/(\{\{[\w.]+\}\})/g)
  return parts
    .map((part) => (/^\{\{[\w.]+\}\}$/.test(part) ? part : escapeHtml(part)))
    .join('')
}

function nl2brKeepingPlaceholders(text: string): string {
  return escapeKeepingPlaceholders(text).replace(/\n/g, '<br/>')
}

export interface CompileEmailDocOptions {
  primaryColor?: string
  logoUrl?: string | null
  templateId?: EmailTemplateId
}

export function compileEmailDoc(
  doc: EmailTemplateDoc,
  options: CompileEmailDocOptions = {}
): { subject: string; html: string } {
  const primaryColor = (options.primaryColor?.trim() || '{{primaryColor}}').replace(/"/g, '')
  const logoUrl = options.logoUrl?.trim() || ''
  const templateId = options.templateId

  const parts: string[] = []

  if (doc.showLogo) {
    if (logoUrl) {
      parts.push(
        `<p style="margin:0 0 16px 0"><img src="${escapeHtml(logoUrl)}" alt="" style="max-height:48px;max-width:200px;display:block" /></p>`
      )
    }
  }

  if (doc.heading.trim()) {
    parts.push(
      `<h2 style="margin:0 0 12px 0;font-family:Inter,Arial,sans-serif;line-height:1.3;color:${primaryColor};font-size:22px">${escapeKeepingPlaceholders(doc.heading.trim())}</h2>`
    )
  }

  if (doc.body.trim()) {
    parts.push(
      `<div style="margin:0 0 12px 0;font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;font-size:15px">${nl2brKeepingPlaceholders(doc.body.trim())}</div>`
    )
  }

  if (doc.buttonLabel.trim()) {
    const href = (doc.buttonHref.trim() || '#').replace(/"/g, '')
    parts.push(
      `<p style="margin:16px 0"><a href="${href}" style="background:${primaryColor};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600">${escapeKeepingPlaceholders(doc.buttonLabel.trim())}</a></p>`
    )
  }

  if (templateId) {
    parts.push(TEMPLATE_FOOTER_HTML[templateId])
  }

  const html = `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">${parts.join('\n')}</div>`

  return {
    subject: doc.subject.trim(),
    html,
  }
}

export function getDefaultEmailTemplateDoc(id: EmailTemplateId): EmailTemplateDoc {
  switch (id) {
    case 'quote':
      return {
        version: 2,
        subject: 'Your quote from {{org.name}}',
        heading: 'Your Quote Is Ready',
        body: `Hi {{customerName}},

{{org.name}} has prepared a quote{{serviceTypeLine}} for you to review and sign online.

Amount: {{totalAmount}}`,
        buttonLabel: 'Review & sign quote',
        buttonHref: '{{acceptanceUrl}}',
        showLogo: true,
      }
    case 'lead_ack':
      return {
        version: 2,
        subject: 'We received your enquiry — {{org.name}}',
        heading: '',
        body: `Hi {{customerName}},

Thanks for contacting {{org.name}}. We've received your enquiry and will call you {{callbackWindow}}.

— {{org.name}}`,
        buttonLabel: '',
        buttonHref: '',
        showLogo: true,
      }
    case 'invoice':
      return {
        version: 2,
        subject: 'Invoice {{invoiceNumber}} from {{org.name}}',
        heading: '{{documentTitle}} {{invoiceNumber}}',
        body: `Hi {{customerName}},

Thank you for choosing {{org.name}}. Please find your invoice details below.

Amount due: {{totalAmount}}
Due date: {{dueDate}}

How to pay:
{{paymentInstructions}}`,
        buttonLabel: '',
        buttonHref: '',
        showLogo: true,
      }
  }
}

function legacyBlocksToDoc(legacy: LegacyEmailTemplateDoc): EmailTemplateDoc {
  const headings = legacy.blocks.filter((b) => b.type === 'heading') as Array<{
    type: 'heading'
    text: string
  }>
  const texts = legacy.blocks.filter((b) => b.type === 'text') as Array<{ type: 'text'; text: string }>
  const button = legacy.blocks.find((b) => b.type === 'button') as
    | { type: 'button'; label: string; href: string }
    | undefined
  const hasLogo = legacy.blocks.some((b) => b.type === 'logo')

  return {
    version: 2,
    subject: legacy.subject,
    heading: headings[0]?.text ?? '',
    body: texts.map((t) => t.text).join('\n\n'),
    buttonLabel: button?.label ?? '',
    buttonHref: button?.href ?? '',
    showLogo: hasLogo || true,
  }
}

export function isEmailTemplateDoc(value: unknown): value is EmailTemplateDoc {
  if (!value || typeof value !== 'object') return false
  const doc = value as Record<string, unknown>
  if (doc.version === 2 && typeof doc.subject === 'string' && typeof doc.body === 'string') {
    return true
  }
  return false
}

function coerceEmailTemplateDoc(value: unknown): EmailTemplateDoc | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (raw.version === 2 && typeof raw.subject === 'string' && typeof raw.body === 'string') {
    return {
      version: 2,
      subject: raw.subject,
      heading: typeof raw.heading === 'string' ? raw.heading : '',
      body: raw.body,
      buttonLabel: typeof raw.buttonLabel === 'string' ? raw.buttonLabel : '',
      buttonHref: typeof raw.buttonHref === 'string' ? raw.buttonHref : '',
      showLogo: raw.showLogo !== false,
    }
  }
  if (raw.version === 1 && typeof raw.subject === 'string' && Array.isArray(raw.blocks)) {
    return legacyBlocksToDoc(raw as unknown as LegacyEmailTemplateDoc)
  }
  return null
}

export function parseEmailTemplateDocsMap(raw: unknown): EmailTemplateDocsMap {
  if (!raw || typeof raw !== 'object') return {}
  const out: EmailTemplateDocsMap = {}
  for (const id of EMAIL_TEMPLATE_IDS) {
    const entry = coerceEmailTemplateDoc((raw as Record<string, unknown>)[id])
    if (entry) out[id] = entry
  }
  return out
}

export function defaultButtonHref(templateId: EmailTemplateId): string {
  return DEFAULT_BUTTON_HREF[templateId]
}
