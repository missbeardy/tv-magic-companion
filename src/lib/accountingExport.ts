import { INVOICE_DUE_DAYS } from '../../shared/invoiceDue'
import type { LineItem } from './lineItems'

export const XERO_CSV_HEADERS = [
  'ContactName',
  'EmailAddress',
  'InvoiceNumber',
  'InvoiceDate',
  'DueDate',
  'Description',
  'Quantity',
  'UnitAmount',
  'AccountCode',
  'TaxType',
] as const

export interface AccountingExportInvoice {
  customer_name: string
  customer_email: string | null
  invoice_number: string
  sent_at: string
  total_amount: number
  line_items: LineItem[] | null
}

export interface BuildXeroSalesCsvOptions {
  gstRegistered: boolean
  accountCode: string
}

/** Escape a CSV cell per RFC-style quoting (quotes when needed; doubles internal "). */
export function escapeCsvCell(value: string | number): string {
  const s = String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Format a Date or ISO string as DD/MM/YYYY (AU / Xero-friendly). */
export function formatCsvDate(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function deriveDueDate(sentAt: Date | string): Date {
  const d = typeof sentAt === 'string' ? new Date(sentAt) : new Date(sentAt.getTime())
  d.setDate(d.getDate() + INVOICE_DUE_DAYS)
  return d
}

export function xeroTaxType(gstRegistered: boolean): string {
  return gstRegistered ? 'GST on Income' : 'BAS Excluded'
}

function normalizeLineItems(
  invoice: AccountingExportInvoice
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

/** Build a Xero sales-invoice CSV string (Tax Inclusive UnitAmount). One row per line item. */
export function buildXeroSalesCsv(
  invoices: AccountingExportInvoice[],
  opts: BuildXeroSalesCsvOptions
): string {
  const accountCode = (opts.accountCode || '200').trim() || '200'
  const taxType = xeroTaxType(opts.gstRegistered)
  const rows: string[] = [XERO_CSV_HEADERS.join(',')]

  for (const invoice of invoices) {
    const sentAt = invoice.sent_at
    if (!sentAt) continue
    const invoiceDate = formatCsvDate(sentAt)
    const dueDate = formatCsvDate(deriveDueDate(sentAt))
    const contact = invoice.customer_name ?? ''
    const email = invoice.customer_email ?? ''

    for (const line of normalizeLineItems(invoice)) {
      const cells = [
        escapeCsvCell(contact),
        escapeCsvCell(email),
        escapeCsvCell(invoice.invoice_number),
        escapeCsvCell(invoiceDate),
        escapeCsvCell(dueDate),
        escapeCsvCell(line.label),
        escapeCsvCell(1),
        escapeCsvCell(line.amount),
        escapeCsvCell(accountCode),
        escapeCsvCell(taxType),
      ]
      rows.push(cells.join(','))
    }
  }

  return rows.join('\r\n') + (rows.length > 1 ? '\r\n' : '')
}

/** Trigger a browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Default date range: first and last day of the current local calendar month (YYYY-MM-DD). */
export function defaultMonthRange(now = new Date()): { from: string; to: string } {
  const y = now.getFullYear()
  const m = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const from = `${y}-${pad(m + 1)}-01`
  const lastDay = new Date(y, m + 1, 0).getDate()
  const to = `${y}-${pad(m + 1)}-${pad(lastDay)}`
  return { from, to }
}

/** Inclusive end-of-day ISO upper bound for a YYYY-MM-DD date string. */
export function endOfDayIso(dateYmd: string): string {
  return `${dateYmd}T23:59:59.999`
}

export function startOfDayIso(dateYmd: string): string {
  return `${dateYmd}T00:00:00.000`
}
