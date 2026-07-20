import { requireAuthHeaders } from './apiAuth'
import { fetchWithTimeout } from './fetchWithTimeout'
import type { LineItem } from './lineItems'

export interface QuoteRecord {
  id: string
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  service_type: string | null
  scope: string
  terms: string | null
  total_amount: number
  gst_amount?: number | null
  line_items?: LineItem[] | null
  currency: string
  token_expires_at: string
  sent_at: string | null
  accepted_at?: string | null
  email_sent?: boolean
  email_message?: string
  sms_sent?: boolean
  sms_message?: string
  org_name?: string
  primary_color?: string
  logo_url?: string | null
}

export interface CreateQuotePayload {
  leadId: string
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  serviceType?: string | null
  scope: string
  terms?: string | null
  totalAmount: number
  lineItems?: LineItem[]
  expiryDays?: number
}

export async function createQuote(payload: CreateQuotePayload): Promise<{
  quote: QuoteRecord & {
    acceptance_url: string
    email_sent?: boolean
    email_message?: string
    sms_sent?: boolean
    sms_message?: string
  }
}> {
  const headers = await requireAuthHeaders()
  const res = await fetchWithTimeout('/api/send-sms?action=quote-create', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    quote?: QuoteRecord & {
      acceptance_url: string
      email_sent?: boolean
      email_message?: string
      sms_sent?: boolean
      sms_message?: string
    }
  }
  if (!res.ok || !data.quote) {
    throw new Error(data.error ?? 'Failed to create quote')
  }
  return { quote: data.quote }
}

export async function getPublicQuote(token: string): Promise<QuoteRecord> {
  const res = await fetchWithTimeout(`/api/send-sms?action=quote-public-get&token=${encodeURIComponent(token)}`)
  const data = (await res.json().catch(() => ({}))) as { error?: string; quote?: QuoteRecord }
  if (!res.ok || !data.quote) throw new Error(data.error ?? 'Failed to load quote')
  return data.quote
}

export async function acceptPublicQuote(payload: {
  token: string
  signerName: string
  signerEmail?: string | null
  signatureText: string
}): Promise<QuoteRecord> {
  const res = await fetchWithTimeout('/api/send-sms?action=quote-public-accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; quote?: QuoteRecord }
  if (!res.ok || !data.quote) throw new Error(data.error ?? 'Failed to accept quote')
  return data.quote
}

export async function declinePublicQuote(payload: {
  token: string
  reason?: string | null
}): Promise<QuoteRecord> {
  const res = await fetchWithTimeout('/api/send-sms?action=quote-public-decline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; quote?: QuoteRecord }
  if (!res.ok || !data.quote) throw new Error(data.error ?? 'Failed to decline quote')
  return data.quote
}
