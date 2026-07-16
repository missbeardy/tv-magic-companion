import { describe, expect, it } from 'vitest'
import {
  buildInvoiceCheckoutSessionParams,
  checkInvoicePayable,
  shouldFulfillInvoicePayment,
} from '../api/_lib/invoiceStripe'

describe('checkInvoicePayable', () => {
  it('rejects a missing invoice', () => {
    expect(checkInvoicePayable(null, true)).toEqual({ ok: false, reason: 'not_found' })
  })

  it('rejects an already-paid invoice', () => {
    expect(checkInvoicePayable({ status: 'paid', token_expires_at: null }, true)).toEqual({
      ok: false,
      reason: 'already_paid',
    })
  })

  it('rejects a draft or void invoice', () => {
    expect(checkInvoicePayable({ status: 'draft', token_expires_at: null }, true)).toEqual({
      ok: false,
      reason: 'not_sent',
    })
    expect(checkInvoicePayable({ status: 'void', token_expires_at: null }, true)).toEqual({
      ok: false,
      reason: 'not_sent',
    })
  })

  it('rejects an expired token', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(checkInvoicePayable({ status: 'sent', token_expires_at: yesterday }, true)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('rejects when the org has not connected Stripe', () => {
    expect(checkInvoicePayable({ status: 'sent', token_expires_at: null }, false)).toEqual({
      ok: false,
      reason: 'not_connected',
    })
  })

  it('allows payment for a sent, unexpired, connected invoice', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    expect(checkInvoicePayable({ status: 'sent', token_expires_at: future }, true)).toEqual({ ok: true })
  })

  it('allows payment when there is no expiry set', () => {
    expect(checkInvoicePayable({ status: 'sent', token_expires_at: null }, true)).toEqual({ ok: true })
  })
})

describe('shouldFulfillInvoicePayment', () => {
  it('fulfils a sent invoice', () => {
    expect(shouldFulfillInvoicePayment('sent')).toBe(true)
  })

  it('does not re-fulfil an already-paid invoice (duplicate webhook delivery)', () => {
    expect(shouldFulfillInvoicePayment('paid')).toBe(false)
  })

  it('does not fulfil a draft or void invoice', () => {
    expect(shouldFulfillInvoicePayment('draft')).toBe(false)
    expect(shouldFulfillInvoicePayment('void')).toBe(false)
  })
})

describe('buildInvoiceCheckoutSessionParams', () => {
  it('builds a single line item for the full invoice total in cents', () => {
    const params = buildInvoiceCheckoutSessionParams({
      invoiceId: 'inv-1',
      orgId: 'org-1',
      invoiceNumber: 'INV-2026-0001',
      totalAmount: 180.5,
      successUrl: 'https://example.com/invoice/abc?paid=1',
      cancelUrl: 'https://example.com/invoice/abc',
    })

    expect(params.mode).toBe('payment')
    expect(params.metadata).toEqual({ invoice_id: 'inv-1', org_id: 'org-1' })
    const lineItem = params.line_items?.[0]
    expect(lineItem?.quantity).toBe(1)
    expect(lineItem?.price_data?.currency).toBe('aud')
    expect(lineItem?.price_data?.unit_amount).toBe(18050)
    expect(lineItem?.price_data?.product_data?.name).toBe('Invoice INV-2026-0001')
  })
})
