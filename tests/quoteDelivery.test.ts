import { describe, expect, it } from 'vitest'
import { buildUnresolvedDeliveryCopy } from '../api/_lib/quotes'

describe('buildUnresolvedDeliveryCopy', () => {
  it('never reports a channel as sent — the quote saved, delivery did not confirm', () => {
    const copy = buildUnresolvedDeliveryCopy({ stillSending: true, hasEmail: true, hasPhone: true })
    expect(copy.emailSent).toBe(false)
    expect(copy.smsSent).toBe(false)
  })

  it('distinguishes still-sending from outright failure', () => {
    const pending = buildUnresolvedDeliveryCopy({ stillSending: true, hasEmail: true, hasPhone: true })
    expect(pending.emailMessage).toMatch(/still sending/i)
    expect(pending.smsMessage).toMatch(/still sending/i)

    const failed = buildUnresolvedDeliveryCopy({ stillSending: false, hasEmail: true, hasPhone: true })
    expect(failed.emailMessage).toMatch(/failed/i)
    expect(failed.smsMessage).toMatch(/failed/i)
  })

  it('uses channel-specific wording so the concatenated message does not stutter', () => {
    const copy = buildUnresolvedDeliveryCopy({ stillSending: true, hasEmail: true, hasPhone: true })
    expect(copy.emailMessage).not.toBe(copy.smsMessage)
  })

  it('reports missing contact details rather than a failure', () => {
    const copy = buildUnresolvedDeliveryCopy({ stillSending: true, hasEmail: false, hasPhone: false })
    expect(copy.emailMessage).toMatch(/no customer email/i)
    expect(copy.smsMessage).toMatch(/no customer phone/i)
    expect(copy.emailMessage).not.toMatch(/failed|still sending/i)
    expect(copy.smsMessage).not.toMatch(/failed|still sending/i)
  })

  it('handles one channel present and the other absent', () => {
    const copy = buildUnresolvedDeliveryCopy({ stillSending: false, hasEmail: true, hasPhone: false })
    expect(copy.emailMessage).toMatch(/failed/i)
    expect(copy.smsMessage).toMatch(/no customer phone/i)
  })
})
