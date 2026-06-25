import { requireAuthHeaders } from './apiAuth'

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
  currency: string
  token_expires_at: string
  sent_at: string | null
  accepted_at?: string | null
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
  expiryDays?: number
}

export async function createQuote(payload: CreateQuotePayload): Promise<{ quote: QuoteRecord & { acceptance_url: string } }> {
  const headers = await requireAuthHeaders()
  const res = await fetch('/api/send-sms?action=quote-create', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; quote?: QuoteRecord & { acceptance_url: string } }
  if (!res.ok || !data.quote) {
    throw new Error(data.error ?? 'Failed to create quote')
  }
  return { quote: data.quote }
}

export async function getPublicQuote(token: string): Promise<QuoteRecord> {
  const res = await fetch(`/api/send-sms?action=quote-public-get&token=${encodeURIComponent(token)}`)
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
  const res = await fetch('/api/send-sms?action=quote-public-accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; quote?: QuoteRecord }
  if (!res.ok || !data.quote) throw new Error(data.error ?? 'Failed to accept quote')
  return data.quote
}
