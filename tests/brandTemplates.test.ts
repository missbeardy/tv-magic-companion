import { describe, it, expect } from 'vitest'
import { buildSmsTemplatePreview, getDefaultSmsTemplates } from '../src/lib/brandTemplates'

describe('brand SMS previews', () => {
  it('builds lead ack SMS preview with callback SLA', () => {
    const defaults = getDefaultSmsTemplates('FieldBourne')
    const preview = buildSmsTemplatePreview('lead_ack_sms', defaults.lead_ack_sms, 'FieldBourne')
    expect(preview).toContain('FieldBourne')
    expect(preview).toContain('within 2 business hours')
  })
})
