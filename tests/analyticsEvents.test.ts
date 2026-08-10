import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_EVENTS,
  CLIENT_RELAYED_EVENTS,
  LEAD_LIFECYCLE_EVENTS,
  assertNoForbiddenKeys,
} from '../shared/analyticsEvents'

describe('analyticsEvents', () => {
  it('defines exactly the 12 named events from the dd1 spec', () => {
    expect(ANALYTICS_EVENTS).toEqual([
      'lead_captured',
      'ack_sent',
      'quote_sent',
      'quote_accepted',
      'booking_created',
      'job_completed',
      'invoice_sent',
      'invoice_paid',
      'review_sent',
      'offline_queue_flush_failed',
      'extraction_fallback_used',
      'login',
    ])
  })

  it('allows properties with only ids/enums/booleans', () => {
    expect(() =>
      assertNoForbiddenKeys({ orgId: 'org-1', leadId: 'lead-1', channel: 'sms' })
    ).not.toThrow()
  })

  it.each(['name', 'customerName', 'PHONE', 'Email', 'address', 'photoUrl', 'notes'])(
    'throws when a property key is on the PII banlist: %s',
    (key) => {
      expect(() => assertNoForbiddenKeys({ [key]: 'value' })).toThrow(/PII banlist/)
    }
  )

  it('only marks login as outside the lead lifecycle', () => {
    expect(LEAD_LIFECYCLE_EVENTS).toHaveLength(ANALYTICS_EVENTS.length - 1)
    expect(LEAD_LIFECYCLE_EVENTS).not.toContain('login')
  })

  it('every client-relayed event is a lead-lifecycle event', () => {
    for (const event of CLIENT_RELAYED_EVENTS) {
      expect(LEAD_LIFECYCLE_EVENTS).toContain(event)
    }
  })
})
