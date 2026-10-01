import { describe, it, expect } from 'vitest'
import { escapeHtml, nl2brHtml } from '../api/_lib/emailTemplates'

describe('emailTemplates', () => {
  it('escapes HTML and converts newlines', () => {
    expect(escapeHtml('<script>&')).toBe('&lt;script&gt;&amp;')
    expect(nl2brHtml('line1\nline2')).toBe('line1<br/>line2')
  })

  it('escapes before converting newlines', () => {
    expect(nl2brHtml('<b>\n"x"')).toBe('&lt;b&gt;<br/>&quot;x&quot;')
  })
})
