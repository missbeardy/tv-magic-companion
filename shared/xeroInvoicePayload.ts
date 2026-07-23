/** Pure Xero Accounting API invoice payload builders — unit-testable without a Xero account. */

import { INVOICE_DUE_DAYS } from './invoiceDue.js'

export interface XeroSyncLineItem {
  label: string
  amount: number
}

export interface XeroSyncInvoiceInput {
  customer_name: string
  customer_email: string | null
  invoice_number: string
  sent_at: string
  total_amount: number
  line_items: XeroSyncLineItem[] | null
  status: string
  paid_at: string | null
}

export interface BuildXeroInvoicePayloadOptions {
  gstRegistered: boolean
  accountCode: string
}

/** Xero AU tax types for sales lines (Tax Inclusive). */
export function xeroApiTaxType(gstRegistered: boolean): string {
  return gstRegistered ? 'OUTPUT' : 'BASEXCLUDED'
}

/** YYYY-MM-DD for Xero Date / DueDate fields. */
export function formatXeroApiDate(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function deriveXeroDueDate(sentAt: Date | string): Date {
  const d = typeof sentAt === 'string' ? new Date(sentAt) : new Date(sentAt.getTime())
  d.setDate(d.getDate() + INVOICE_DUE_DAYS)
  return d
}

function normalizeLineItems(
  invoice: XeroSyncInvoiceInput
): Array<{ label: string; amount: number }> {
  const items = Array.isArray(invoice.line_items)
    ? invoice.line_items.filter((i) => i && typeof i.label === 'string' && i.label.trim())
    : []
  if (items.length > 0) {
    return items.map((i) => ({
      label: i.label.trim(),
      amount: Number(i.amount) || 0,
    }))
  }
  return [
    {
      label: `Invoice ${invoice.invoice_number}`,
      amount: Number(invoice.total_amount) || 0,
    },
  ]
}

export interface XeroInvoiceApiPayload {
  Type: 'ACCREC'
  Contact: { Name: string; EmailAddress?: string }
  Date: string
  DueDate: string
  InvoiceNumber: string
  Reference?: string
  LineAmountTypes: 'Inclusive'
  Status: 'AUTHORISED'
  LineItems: Array<{
    Description: string
    Quantity: number
    UnitAmount: number
    AccountCode: string
    TaxType: string
  }>
}

/** Build one ACCREC invoice body for POST /Invoices (Tax Inclusive UnitAmount). */
export function buildXeroInvoicePayload(
  invoice: XeroSyncInvoiceInput,
  opts: BuildXeroInvoicePayloadOptions
): XeroInvoiceApiPayload {
  const accountCode = (opts.accountCode || '200').trim() || '200'
  const taxType = xeroApiTaxType(opts.gstRegistered)
  const sentAt = invoice.sent_at
  const contact: XeroInvoiceApiPayload['Contact'] = {
    Name: (invoice.customer_name || 'Customer').trim() || 'Customer',
  }
  const email = invoice.customer_email?.trim()
  if (email) contact.EmailAddress = email

  const isPaid = invoice.status === 'paid' || Boolean(invoice.paid_at)
  const reference = isPaid
    ? `FieldBourne ${invoice.invoice_number} (paid in FieldBourne)`
    : `FieldBourne ${invoice.invoice_number}`

  // Always AUTHORISED — Status PAID on create needs AmountPaid and is brittle across orgs.
  return {
    Type: 'ACCREC',
    Contact: contact,
    Date: formatXeroApiDate(sentAt),
    DueDate: formatXeroApiDate(deriveXeroDueDate(sentAt)),
    InvoiceNumber: invoice.invoice_number,
    Reference: reference,
    LineAmountTypes: 'Inclusive',
    Status: 'AUTHORISED',
    LineItems: normalizeLineItems(invoice).map((line) => ({
      Description: line.label,
      Quantity: 1,
      UnitAmount: line.amount,
      AccountCode: accountCode,
      TaxType: taxType,
    })),
  }
}
