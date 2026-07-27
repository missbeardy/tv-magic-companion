import { describe, it, expect } from 'vitest'
import {
  buildQuoteEmailFromBrand,
  buildLeadAckEmailFromBrand,
  buildInvoiceEmailFromOrg,
  escapeHtml,
  getDefaultQuoteEmailTemplates,
  getDefaultLeadAckEmailTemplates,
  getDefaultInvoiceEmailTemplates,
  nl2brHtml,
  resolveEmailTemplateValue,
} from '../api/_lib/emailTemplates'
import {
  compileEmailDoc,
  getDefaultEmailTemplateDoc,
  EMAIL_TEMPLATE_STORAGE_KEYS,
  EMAIL_TEMPLATE_IDS,
} from '../shared/emailTemplateDocs'

describe('emailTemplates', () => {
  it('escapes HTML and converts newlines', () => {
    expect(escapeHtml('<script>&')).toBe('&lt;script&gt;&amp;')
    expect(nl2brHtml('line1\nline2')).toBe('line1<br/>line2')
  })

  it('builds quote email from brand templates with placeholders', () => {
    const templates = getDefaultQuoteEmailTemplates()
    const { subject, html } = buildQuoteEmailFromBrand(templates, {
      'org.name': 'TV Magic Brisbane',
      customerName: 'Jane',
      acceptanceUrl: 'https://example.com/quote/abc',
      totalAmount: 'AUD 250.00',
      serviceTypeLine: ' for TV Aerial',
      scopeHtml: 'Install aerial<br/>Tune channels',
      termsBlock: '',
      senderBlock: '<p>Prepared by: Sam</p>',
      primaryColor: '#004B93',
    })

    expect(subject).toBe('Your quote from TV Magic Brisbane')
    expect(html).toContain('Hi Jane')
    expect(html).toContain('https://example.com/quote/abc')
    expect(html).toContain('AUD 250.00')
    expect(html).toContain('Prepared by: Sam')
    expect(html).toContain('#004B93')
  })

  it('falls back when brand templates are missing keys', () => {
    const { subject } = buildQuoteEmailFromBrand({}, { 'org.name': 'Demo Org' })
    expect(subject).toBe('Your quote from Demo Org')
  })

  it('uses custom brand subject override', () => {
    const { subject } = buildQuoteEmailFromBrand(
      { customer_quote_request_subject: 'Quote ready — {{org.name}}' },
      { 'org.name': 'Northside' }
    )
    expect(subject).toBe('Quote ready — Northside')
  })

  it('prefers org template over brand over default', () => {
    expect(
      resolveEmailTemplateValue(
        { customer_quote_request_subject: 'Org: {{org.name}}' },
        { customer_quote_request_subject: 'Brand: {{org.name}}' },
        'customer_quote_request_subject',
        'Default: {{org.name}}'
      )
    ).toBe('Org: {{org.name}}')

    expect(
      resolveEmailTemplateValue(
        {},
        { customer_quote_request_subject: 'Brand: {{org.name}}' },
        'customer_quote_request_subject',
        'Default: {{org.name}}'
      )
    ).toBe('Brand: {{org.name}}')

    expect(
      resolveEmailTemplateValue(
        { customer_quote_request_subject: '   ' },
        null,
        'customer_quote_request_subject',
        'Default: {{org.name}}'
      )
    ).toBe('Default: {{org.name}}')
  })

  it('builds quote with org override winning over brand', () => {
    const { subject } = buildQuoteEmailFromBrand(
      { customer_quote_request_subject: 'Brand subject {{org.name}}' },
      { 'org.name': 'Westside' },
      undefined,
      { customer_quote_request_subject: 'Franchise subject {{org.name}}' }
    )
    expect(subject).toBe('Franchise subject Westside')
  })

  it('builds lead ack with org override', () => {
    const { subject } = buildLeadAckEmailFromBrand(
      getDefaultLeadAckEmailTemplates(),
      { 'org.name': 'Ack Org', customerName: 'Pat', callbackWindow: 'soon', orgPhoneBlock: '' },
      undefined,
      { lead_ack_email_subject: 'Got it — {{org.name}}' }
    )
    expect(subject).toBe('Got it — Ack Org')
  })

  it('builds invoice falling back to brand when org empty', () => {
    const { subject } = buildInvoiceEmailFromOrg(
      {},
      { 'org.name': 'Inv Org', invoiceNumber: 'INV-1' },
      getDefaultInvoiceEmailTemplates(),
      { customer_invoice_subject: 'Brand invoice {{invoiceNumber}}' }
    )
    expect(subject).toBe('Brand invoice INV-1')
  })
})

describe('emailTemplateDocs', () => {
  it('compiles default docs with required placeholders preserved', () => {
    for (const id of EMAIL_TEMPLATE_IDS) {
      const doc = getDefaultEmailTemplateDoc(id)
      const { subject, html } = compileEmailDoc(doc, { primaryColor: '#004B93', templateId: id })
      expect(subject.length).toBeGreaterThan(0)
      expect(html).toContain('max-width:560px')

      const keys = EMAIL_TEMPLATE_STORAGE_KEYS[id]
      expect(keys.subject).toBeTruthy()
      expect(keys.html).toBeTruthy()
    }
  })

  it('preserves {{placeholders}} in body and button href', () => {
    const doc = getDefaultEmailTemplateDoc('quote')
    const { html } = compileEmailDoc(doc, { primaryColor: '#111111', templateId: 'quote' })
    expect(html).toContain('{{customerName}}')
    expect(html).toContain('{{acceptanceUrl}}')
    expect(html).toContain('{{scopeHtml}}')
    expect(html).toContain('{{totalAmount}}')
  })

  it('default subjects match legacy default subjects', () => {
    expect(getDefaultEmailTemplateDoc('quote').subject).toBe(
      getDefaultQuoteEmailTemplates().customer_quote_request_subject
    )
    expect(getDefaultEmailTemplateDoc('lead_ack').subject).toBe(
      getDefaultLeadAckEmailTemplates().lead_ack_email_subject
    )
    expect(getDefaultEmailTemplateDoc('invoice').subject).toBe(
      getDefaultInvoiceEmailTemplates().customer_invoice_subject
    )
  })

  it('escapes user text but keeps placeholders', () => {
    const { html } = compileEmailDoc(
      {
        version: 2,
        subject: 'Hi',
        heading: '',
        body: 'Hello <b>{{customerName}}</b>',
        buttonLabel: '',
        buttonHref: '',
        showLogo: false,
      },
      { templateId: 'lead_ack' }
    )
    expect(html).toContain('Hello &lt;b&gt;{{customerName}}&lt;/b&gt;')
  })
})
