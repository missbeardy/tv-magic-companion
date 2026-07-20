import { randomBytes } from 'node:crypto'
import {
  buildInvoiceEmailFromOrg,
  nl2brHtml,
} from './emailTemplates.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { sendTransactionalEmail, type TransactionalEmailAttachment } from './sendTransactionalEmail.js'
import { formatAbn, gstComponentOf } from '../../shared/gst.js'
import { getPlatformUrl } from './platformUrl.js'
import { maybeSendReviewOnInvoicePaid } from './reviewRequest.js'

const INVOICE_TOKEN_VALID_DAYS = 90

function buildInvoiceToken(): string {
  return randomBytes(24).toString('hex')
}

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
  gstRegistered?: boolean
  abn?: string | null
  baseUrl?: string | null
  showPayButton?: boolean
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
  const gstRegistered = input.gstRegistered !== false
  const gstAmount = gstRegistered ? gstComponentOf(input.totalAmount) : null
  const publicToken = buildInvoiceToken()
  const tokenExpiresAt = new Date(
    Date.now() + INVOICE_TOKEN_VALID_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

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
      gst_amount: gstAmount,
      currency: 'AUD',
      customer_name: input.customerName,
      customer_email: customerEmail,
      line_items: lineItems,
      delivery_method: 'email',
      pdf_storage_path: input.pdfStoragePath ?? null,
      public_token: publicToken,
      token_expires_at: tokenExpiresAt,
    })
    .select(
      'id, org_id, lead_id, invoice_number, status, total_amount, gst_amount, currency, customer_name, customer_email, sent_at, paid_at, public_token'
    )
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create invoice')
  }

  const paymentInstructions = input.paymentInstructions?.trim()
    ? nl2brHtml(input.paymentInstructions.trim())
    : 'Please contact us to arrange payment.'

  const documentTitle = gstRegistered ? 'Tax Invoice' : 'Invoice'
  const abnLine = input.abn?.trim()
    ? `<p style="font-size:12px;color:#6b7280">ABN: ${escapeHtml(formatAbn(input.abn.trim()))}</p>`
    : ''
  const gstLine =
    gstAmount != null
      ? `<p style="font-size:12px;color:#6b7280">Total includes GST of AUD ${gstAmount.toFixed(2)}</p>`
      : ''
  const payButton = input.showPayButton
    ? `<p style="margin:20px 0"><a href="${(input.baseUrl?.trim() || getPlatformUrl()).replace(/\/$/, '')}/api/stripe?action=invoice-pay&token=${publicToken}" style="background:${input.primaryColor?.trim() || '#004B93'};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Pay Now</a></p>`
    : ''

  const { subject, html } = buildInvoiceEmailFromOrg(input.emailTemplates, {
    'org.name': input.orgName?.trim() ?? '',
    customerName: input.customerName,
    customerEmail,
    invoiceNumber,
    documentTitle,
    abnLine,
    totalAmount: `AUD ${Number(input.totalAmount).toFixed(2)}`,
    gstLine,
    payButton,
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
      'id, org_id, lead_id, invoice_number, status, total_amount, gst_amount, currency, customer_name, customer_email, sent_at, paid_at, public_token'
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

const INVOICE_PAID_SELECT =
  'id, org_id, lead_id, invoice_number, status, total_amount, gst_amount, currency, customer_name, customer_email, sent_at, paid_at, paid_via'

export async function markInvoicePaid(
  invoiceId: string,
  orgId: string,
  paidVia: 'manual' | 'stripe' = 'manual',
  stripeIds?: { checkoutSessionId?: string | null; paymentIntentId?: string | null }
) {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Server not configured')

  // Idempotent: a second call (duplicate webhook delivery, or a manual mark-paid
  // after the customer already paid by card) is a no-op, not an error.
  const { data: existing, error: existingError } = await supabase
    .from('invoices')
    .select(INVOICE_PAID_SELECT)
    .eq('id', invoiceId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (!existing) throw new Error('Invoice not found')
  if (existing.status === 'paid') return existing

  const paidAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: paidAt,
      paid_via: paidVia,
      updated_at: paidAt,
      ...(stripeIds?.checkoutSessionId ? { stripe_checkout_session_id: stripeIds.checkoutSessionId } : {}),
      ...(stripeIds?.paymentIntentId ? { stripe_payment_intent_id: stripeIds.paymentIntentId } : {}),
    })
    .eq('id', invoiceId)
    .eq('org_id', orgId)
    .eq('status', 'sent')
    .select(INVOICE_PAID_SELECT)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Invoice not found or cannot be marked paid')

  // Paid → review (Package 6 / T2.1). Non-blocking: never fail mark-paid if SMS fails.
  if (data.lead_id) {
    void maybeSendReviewOnInvoicePaid(orgId, data.lead_id).catch((err) => {
      console.error('auto_review_on_paid failed (non-fatal):', err)
    })
  }

  return data
}

export interface PublicInvoice {
  id: string
  org_id: string
  invoice_number: string
  status: string
  total_amount: number
  gst_amount: number | null
  line_items: InvoiceLineItem[] | null
  currency: string
  customer_name: string
  paid_at: string | null
  token_expires_at: string | null
}

export async function getInvoiceByToken(token: string): Promise<PublicInvoice | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Server not configured')

  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, org_id, invoice_number, status, total_amount, gst_amount, line_items, currency, customer_name, paid_at, token_expires_at'
    )
    .eq('public_token', token)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as PublicInvoice | null
}

function formatDueDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}
