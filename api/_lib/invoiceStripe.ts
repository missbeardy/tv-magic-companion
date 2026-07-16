import type Stripe from 'stripe'

export interface PayableInvoice {
  status: string
  token_expires_at: string | null
}

export type InvoicePayabilityResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'already_paid' | 'not_sent' | 'expired' | 'not_connected' }

/** Whether a customer clicking the Pay Now link should be sent to Stripe. */
export function checkInvoicePayable(
  invoice: PayableInvoice | null,
  orgConnected: boolean
): InvoicePayabilityResult {
  if (!invoice) return { ok: false, reason: 'not_found' }
  if (invoice.status === 'paid') return { ok: false, reason: 'already_paid' }
  if (invoice.status !== 'sent') return { ok: false, reason: 'not_sent' }
  if (invoice.token_expires_at && new Date(invoice.token_expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' }
  }
  if (!orgConnected) return { ok: false, reason: 'not_connected' }
  return { ok: true }
}

/** Idempotency guard for checkout.session.completed — only fulfil invoices still 'sent'. */
export function shouldFulfillInvoicePayment(currentStatus: string): boolean {
  return currentStatus === 'sent'
}

export function buildInvoiceCheckoutSessionParams(params: {
  invoiceId: string
  orgId: string
  invoiceNumber: string
  totalAmount: number
  successUrl: string
  cancelUrl: string
}): Stripe.Checkout.SessionCreateParams {
  return {
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'aud',
          product_data: { name: `Invoice ${params.invoiceNumber}` },
          unit_amount: Math.round(params.totalAmount * 100),
        },
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { invoice_id: params.invoiceId, org_id: params.orgId },
  }
}
