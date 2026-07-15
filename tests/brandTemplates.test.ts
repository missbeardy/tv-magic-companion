import { describe, it, expect } from 'vitest'
import {
  buildLeadAckEmailPreview,
  buildQuoteEmailPreview,
  buildSmsTemplatePreview,
  getDefaultEmailTemplates,
  getDefaultSmsTemplates,
  QUOTE_EMAIL_TEMPLATE_KEY_HTML,
  QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT,
} from '../src/lib/brandTemplates'

describe('buildQuoteEmailPreview', () => {
  it('interpolates sample vars into subject and html', () => {
    const defaults = getDefaultEmailTemplates()
    const { subject, html } = buildQuoteEmailPreview(
      defaults[QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT],
      defaults[QUOTE_EMAIL_TEMPLATE_KEY_HTML],
      '#004B93'
    )

    expect(subject).toBe('Your quote from Sample Franchise')
    expect(html).toContain('Jane Smith')
    expect(html).toContain('https://example.com/quote/sample-token')
    expect(html).toContain('#004B93')
  })
})

describe('brand SMS and ack email previews', () => {
  it('builds lead ack SMS preview with callback SLA', () => {
    const defaults = getDefaultSmsTemplates('FieldBourne')
    const preview = buildSmsTemplatePreview('lead_ack_sms', defaults.lead_ack_sms, 'FieldBourne')
    expect(preview).toContain('FieldBourne')
    expect(preview).toContain('within 2 business hours')
  })

  it('builds lead ack email preview', () => {
    const defaults = getDefaultEmailTemplates()
    const { subject, html } = buildLeadAckEmailPreview(
      defaults.lead_ack_email_subject,
      defaults.lead_ack_email_html,
      'FieldBourne'
    )
    expect(subject).toContain('FieldBourne')
    expect(html).toContain('within 2 business hours')
  })
})
