import { describe, expect, it } from 'vitest'
import {
  buildInvoiceEmailFromOrg,
  getDefaultInvoiceEmailTemplates,
} from '../api/_lib/emailTemplates'
import { resolveInvoiceAmountFromSources, formatInvoiceNumber } from '../src/lib/resolveInvoiceAmount'

describe('resolveInvoiceAmountFromSources', () => {
  it('prefers accepted quote over event job quote', () => {
    expect(
      resolveInvoiceAmountFromSources({ acceptedQuoteAmount: 450, eventJobQuote: 200 })
    ).toBe(450)
  })

  it('uses event job quote when no accepted quote', () => {
    expect(
      resolveInvoiceAmountFromSources({ acceptedQuoteAmount: null, eventJobQuote: 180 })
    ).toBe(180)
  })

  it('returns null when no sources', () => {
    expect(resolveInvoiceAmountFromSources({ acceptedQuoteAmount: null, eventJobQuote: null })).toBeNull()
  })
})

describe('formatInvoiceNumber', () => {
  it('pads sequence', () => {
    expect(formatInvoiceNumber(3, 2026)).toBe('INV-2026-0003')
  })
})

describe('buildInvoiceEmailFromOrg', () => {
  it('substitutes invoice placeholders', () => {
    const templates = getDefaultInvoiceEmailTemplates()
    const { subject, html } = buildInvoiceEmailFromOrg(templates, {
      'org.name': 'TV Magic',
      customerName: 'Jane',
      customerEmail: 'jane@test.com',
      invoiceNumber: 'INV-2026-0001',
      totalAmount: 'AUD 99.00',
      dueDate: '1 July 2026',
      lineItemsHtml: '<p>Line</p>',
      paymentInstructions: 'BSB 000-000',
      serviceType: 'Aerial',
      jobDate: '30 June 2026',
      primaryColor: '#004B93',
      senderBlock: '',
    })
    expect(subject).toContain('INV-2026-0001')
    expect(html).toContain('Jane')
    expect(html).toContain('BSB 000-000')
  })
})
