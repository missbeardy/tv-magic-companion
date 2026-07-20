import { requireAuthHeaders } from './apiAuth'
import { fetchWithTimeout } from './fetchWithTimeout'
import type { LineItem } from './lineItems'

export interface PublicInvoiceRecord {
  id: string
  invoice_number: string
  status: 'draft' | 'sent' | 'paid' | 'void'
  total_amount: number
  gst_amount: number | null
  line_items: LineItem[] | null
  currency: string
  customer_name: string
  paid_at: string | null
  token_expires_at: string | null
  card_payments_enabled: boolean
  org_name?: string
  primary_color?: string
  logo_url?: string | null
}

export async function getPublicInvoice(token: string): Promise<PublicInvoiceRecord> {
  const res = await fetchWithTimeout(`/api/send-sms?action=invoice-public-get&token=${encodeURIComponent(token)}`)
  const data = (await res.json().catch(() => ({}))) as { error?: string; invoice?: PublicInvoiceRecord }
  if (!res.ok || !data.invoice) throw new Error(data.error ?? 'Failed to load invoice')
  return data.invoice
}

export interface InvoiceRecord {
  id: string
  org_id: string
  lead_id: string
  invoice_number: string
  status: 'draft' | 'sent' | 'paid' | 'void'
  total_amount: number
  gst_amount?: number | null
  currency: string
  customer_name: string
  customer_email: string | null
  sent_at: string | null
  paid_at: string | null
  paid_via?: string | null
  email_sent?: boolean
  email_message?: string
}

export interface InvoiceLineItem {
  label: string
  amount: number
}

export interface SendInvoicePayload {
  leadId: string
  quoteId?: string | null
  customerName: string
  customerEmail: string
  serviceType?: string | null
  totalAmount: number
  lineItems?: InvoiceLineItem[]
  pdfStoragePath?: string | null
  senderName?: string
}

export async function sendInvoiceEmail(payload: SendInvoicePayload): Promise<{ invoice: InvoiceRecord }> {
  const headers = await requireAuthHeaders()
  const res = await fetchWithTimeout('/api/send-sms?action=invoice-send-email', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; invoice?: InvoiceRecord }
  if (!res.ok || !data.invoice) {
    throw new Error(data.error ?? 'Failed to send invoice')
  }
  return { invoice: data.invoice }
}

export async function markInvoicePaid(invoiceId: string): Promise<{ invoice: InvoiceRecord }> {
  const headers = await requireAuthHeaders()
  const res = await fetchWithTimeout('/api/send-sms?action=invoice-mark-paid', {
    method: 'POST',
    headers,
    body: JSON.stringify({ invoiceId }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; invoice?: InvoiceRecord }
  if (!res.ok || !data.invoice) {
    throw new Error(data.error ?? 'Failed to mark invoice paid')
  }
  return { invoice: data.invoice }
}
