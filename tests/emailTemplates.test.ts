import { describe, it, expect } from 'vitest'
import {
  buildQuoteEmailFromBrand,
  escapeHtml,
  getDefaultQuoteEmailTemplates,
  nl2brHtml,
} from '../api/_lib/emailTemplates'

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
})
