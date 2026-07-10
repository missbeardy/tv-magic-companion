import { buildSmsFromBrand } from './smsTemplates.js'
import { interpolateTemplate } from './smsTemplates.js'
import type { ChaseStage } from './invoiceChasePolicy.js'

export const INVOICE_CHASE_SMS_FALLBACKS: Record<ChaseStage, string> = {
  1: "Hi {{firstName}}, a reminder from {{org.name}} — invoice {{invoiceNumber}} for {{amount}} was due on {{dueDate}}. If you've already paid, ignore this. Any questions, just reply.",
  2: 'Hi {{firstName}}, invoice {{invoiceNumber}} for {{amount}} from {{org.name}} is now {{daysOverdue}} days overdue. Reply here or call us to sort it out.',
  3: 'Hi {{firstName}}, invoice {{invoiceNumber}} for {{amount}} from {{org.name}} is now {{daysOverdue}} days overdue. Please reply or call us so we can help resolve this.',
}

export const INVOICE_CHASE_EMAIL_SUBJECTS: Record<ChaseStage, string> = {
  1: 'Invoice reminder — {{invoiceNumber}} from {{org.name}}',
  2: 'Overdue invoice — {{invoiceNumber}} from {{org.name}}',
  3: 'Overdue invoice — {{invoiceNumber}} from {{org.name}}',
}

export const INVOICE_CHASE_EMAIL_BODIES: Record<ChaseStage, string> = {
  1: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <p>Hi {{firstName}},</p>
  <p>A reminder from {{org.name}} — invoice {{invoiceNumber}} for {{amount}} was due on {{dueDate}}.</p>
  <p>If you've already paid, please ignore this message. Any questions, just reply.</p>
</div>`,
  2: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <p>Hi {{firstName}},</p>
  <p>Invoice {{invoiceNumber}} for {{amount}} from {{org.name}} is now {{daysOverdue}} days overdue.</p>
  <p>Reply to this email or call us to sort it out.</p>
</div>`,
  3: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <p>Hi {{firstName}},</p>
  <p>Invoice {{invoiceNumber}} for {{amount}} from {{org.name}} is now {{daysOverdue}} days overdue.</p>
  <p>Please reply or call us so we can help resolve this.</p>
</div>`,
}

export interface InvoiceChaseMessageVars {
  firstName: string
  invoiceNumber: string
  amount: string
  dueDate: string
  daysOverdue: string
  'org.name': string
  // Index signature so this is assignable to the template renderer's TemplateVars.
  [key: string]: string
}

export function buildInvoiceChaseSms(
  smsTemplates: Record<string, string> | null | undefined,
  stage: ChaseStage,
  vars: InvoiceChaseMessageVars
): string {
  const key = `invoice_chase_stage_${stage}`
  return buildSmsFromBrand(smsTemplates, key, vars, INVOICE_CHASE_SMS_FALLBACKS[stage])
}

export function buildInvoiceChaseEmail(
  stage: ChaseStage,
  vars: InvoiceChaseMessageVars
): { subject: string; html: string } {
  return {
    subject: interpolateTemplate(INVOICE_CHASE_EMAIL_SUBJECTS[stage], vars),
    html: interpolateTemplate(INVOICE_CHASE_EMAIL_BODIES[stage], vars),
  }
}
