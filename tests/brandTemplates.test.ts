import { describe, it, expect } from 'vitest'
import {
  buildQuoteEmailPreview,
  getDefaultEmailTemplates,
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
