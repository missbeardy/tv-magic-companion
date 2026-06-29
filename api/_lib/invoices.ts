import {
  buildInvoiceEmailFromOrg,
  nl2brHtml,
} from './emailTemplates.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { sendTransactionalEmail, type TransactionalEmailAttachment } from './sendTransactionalEmail.js'

export interface InvoiceLineItem {
  label: string
  amount: number
}

export interface InvoiceSendInput {
  orgId: string
  createdBy: string
  leadId: string
  quoteId?: string | null
  customerName: string
  customerEmail: string
  serviceType?: string | null
  totalAmount: number
  lineItems?: InvoiceLineItem[]
  pdfStoragePath?: string | null
  orgName?: string
  senderName?: string
  emailTemplates?: Record<string, string> | null
  paymentInstructions?: string | null
  orgPdfTemplatePath?: string | null
  primaryColor?: string
}

function buildLineItemsHtml(items: InvoiceLineItem[]): string {
  if (!items.length) return ''
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(item.label)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;text-align:right">AUD ${Number(item.amount).toFixed(2)}</td></tr>`
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px"><tbody>${rows}</tbody></table>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function nextInvoiceNumber(orgId: string): Promise<string> {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Server not configured')
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const { count, error } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .like('invoice_number', `${prefix}%`)
  if (error) throw new Error(error.message)
  const seq = (count ?? 0) + 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

async function downloadPdfAttachment(storagePath: string, filename: string): Promise<TransactionalEmailAttachment | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase.storage.from('org-invoice-templates').download(storagePath)
  if (error || !data) {
    console.error('Invoice PDF download failed:', storagePath, error?.message)
    return null
  }
  const buffer = Buffer.from(await data.arrayBuffer())
  return { filename, content: buffer }
}

async function collectPdfAttachments(
  orgPdfTemplatePath: string | null | undefined,
  perJobPdfPath: string | null | undefined
): Promise<TransactionalEmailAttachment[]> {
  const attachments: TransactionalEmailAttachment[] = []
  if (orgPdfTemplatePath?.trim()) {
    const orgPdf = await downloadPdfAttachment(orgPdfTemplatePath.trim(), 'invoice-template.pdf')
    if (orgPdf) attachments.push(orgPdf)
  }
  if (perJobPdfPath?.trim() && perJobPdfPath !== orgPdfTemplatePath?.trim()) {
    const jobPdf = await downloadPdfAttachment(perJobPdfPath.trim(), 'invoice.pdf')
    if (jobPdf) attachments.push(jobPdf)
  }
  return attachments
}

export async function createAndSendInvoice(input: InvoiceSendInput) {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Server not configured')

  const customerEmail = input.customerEmail.trim()
  if (!customerEmail) throw new Error('Customer email is required to send an invoice')

  const invoiceNumber = await nextInvoiceNumber(input.orgId)
  const lineItems = input.lineItems ?? []
  const sentAt = new Date().toISOString()
  const dueDate = formatDueDate(14)
  const jobDate = new Date().toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      org_id: input.orgId,
      lead_id: input.leadId,
      quote_id: input.quoteId ?? null,
      created_by: input.createdBy,
      invoice_number: invoiceNumber,
      status: 'draft',
      total_amount: input.totalAmount,
      currency: 'AUD',
      customer_name: input.customerName,
      customer_email: customerEmail,
      line_items: lineItems,
      delivery_method: 'email',
      pdf_storage_path: input.pdfStoragePath ?? null,
    })
    .select(
      'id, org_id, lead_id, invoice_number, status, total_amount, currency, customer_name, customer_email, sent_at, paid_at'
    )
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create invoice')
  }

  const paymentInstructions = input.paymentInstructions?.trim()
    ? nl2brHtml(input.paymentInstructions.trim())
    : 'Please contact us to arrange payment.'

  const { subject, html } = buildInvoiceEmailFromOrg(input.emailTemplates, {
    'org.name': input.orgName?.trim() ?? '',
    customerName: input.customerName,
    customerEmail,
    invoiceNumber,
    totalAmount: `AUD ${Number(input.totalAmount).toFixed(2)}`,
    dueDate,
    lineItemsHtml: buildLineItemsHtml(lineItems),
    paymentInstructions,
    serviceType: input.serviceType?.trim() ?? '',
    jobDate,
    primaryColor: input.primaryColor?.trim() || '#004B93',
    senderBlock: input.senderName?.trim()
      ? `<p>Prepared by: ${escapeHtml(input.senderName.trim())}</p>`
      : '',
  })

  const attachments = await collectPdfAttachments(input.orgPdfTemplatePath, input.pdfStoragePath)

  const emailResult = await sendTransactionalEmail({
    to: customerEmail,
    subject,
    html,
    attachments: attachments.length ? attachments : undefined,
  })

  if (!emailResult.sent) {
    await supabase.from('invoices').delete().eq('id', data.id)
    throw new Error(emailResult.message)
  }

  const { data: updated, error: updateError } = await supabase
    .from('invoices')
    .update({
      status: 'sent',
      sent_at: sentAt,
      updated_at: sentAt,
    })
    .eq('id', data.id)
    .select(
      'id, org_id, lead_id, invoice_number, status, total_amount, currency, customer_name, customer_email, sent_at, paid_at'
    )
    .single()

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? 'Invoice sent but status update failed')
  }

  return {
    ...updated,
    email_sent: true,
    email_message: emailResult.message,
  }
}

export async function markInvoicePaid(invoiceId: string, orgId: string) {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Server not configured')

  const paidAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: paidAt,
      paid_via: 'manual',
      updated_at: paidAt,
    })
    .eq('id', invoiceId)
    .eq('org_id', orgId)
    .eq('status', 'sent')
    .select(
      'id, org_id, lead_id, invoice_number, status, total_amount, currency, customer_name, customer_email, sent_at, paid_at, paid_via'
    )
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Invoice not found or cannot be marked paid')
  return data
}

function formatDueDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}
