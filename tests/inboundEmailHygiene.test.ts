import { describe, expect, it } from 'vitest'
import { isAutomatedInboundEmail } from '../api/_lib/inboundLeadDedup'

describe('isAutomatedInboundEmail', () => {
  it('skips auto-submitted and out-of-office mail', () => {
    expect(isAutomatedInboundEmail({ 'Auto-Submitted': 'auto-replied' }, 'Thanks')).toBe(true)
    expect(isAutomatedInboundEmail({ precedence: 'bulk' }, 'Newsletter')).toBe(true)
    expect(isAutomatedInboundEmail({}, 'Automatic reply: out of office')).toBe(true)
    expect(isAutomatedInboundEmail({ 'auto-submitted': 'no' }, 'Need an aerial')).toBe(false)
  })
})
