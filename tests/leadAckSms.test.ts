import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildLeadAckMessage,
  buildOrgPhoneLine,
  LEAD_ACK_FALLBACK,
} from '../src/lib/leadAckSms'
import {
  canAccessFeatureSwitch,
  getDefaultFeatureSwitchState,
} from '../src/lib/features'

const isFeatureEnabledForOrg = vi.fn()
const sendBrandedSms = vi.fn()

vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: (...args: unknown[]) => isFeatureEnabledForOrg(...args),
}))

vi.mock('../api/_lib/sendBrandedSms.js', () => ({
  sendBrandedSms: (...args: unknown[]) => sendBrandedSms(...args),
}))

describe('buildLeadAckMessage', () => {
  it('uses default template with org name and customer fallback', () => {
    const message = buildLeadAckMessage('TVMagic Sydney')
    expect(message).toContain('TVMagic Sydney')
    expect(message).toContain('there')
    expect(message).toContain('received your enquiry')
  })

  it('interpolates customer name when provided', () => {
    const message = buildLeadAckMessage('TVMagic Sydney', 'Jane')
    expect(message).toContain('Jane')
    expect(message).not.toContain('there')
  })

  it('uses brand template override when supplied', () => {
    const message = buildLeadAckMessage(
      'TVMagic',
      'Bob',
      'Thanks {{customerName}} — {{org.name}} got your message.'
    )
    expect(message).toBe('Thanks Bob — TVMagic got your message.')
  })

  it('matches approved fallback copy', () => {
    expect(LEAD_ACK_FALLBACK).toContain('thanks for contacting')
    expect(LEAD_ACK_FALLBACK).toContain('{{callbackWindow}}')
    expect(LEAD_ACK_FALLBACK).toContain('{{orgPhoneLine}}')
  })

  it('includes callback window in rendered message', () => {
    const message = buildLeadAckMessage('TVMagic Sydney', 'Jane')
    expect(message).toContain('within 2 business hours')
  })

  it('includes urgent call line when support phone is set', () => {
    const message = buildLeadAckMessage('TVMagic Sydney', 'Jane', null, '0412 345 678')
    expect(message).toContain('Need us urgently? Call 0412 345 678.')
    expect(message).toMatch(/within 2 business hours\. Need us urgently/)
  })

  it('omits urgent call line when support phone is missing', () => {
    const message = buildLeadAckMessage('TVMagic Sydney', 'Jane')
    expect(message).not.toContain('Need us urgently')
    expect(message).toMatch(/within 2 business hours\.$/)
  })

  it('buildOrgPhoneLine returns empty string for blank phone', () => {
    expect(buildOrgPhoneLine(null)).toBe('')
    expect(buildOrgPhoneLine('   ')).toBe('')
  })

  it('buildOrgPhoneLine formats call line with phone', () => {
    expect(buildOrgPhoneLine('0412 345 678')).toBe(' Need us urgently? Call 0412 345 678.')
  })
})

describe('lead_ack_sms feature gating', () => {
  it('is off by default', () => {
    const defaults = getDefaultFeatureSwitchState()
    expect(defaults.lead_ack_sms).toBe(false)
    expect(canAccessFeatureSwitch('lead_ack_sms', 'basic', defaults)).toBe(false)
  })

  it('requires switch on for access', () => {
    const switches = { ...getDefaultFeatureSwitchState(), lead_ack_sms: true }
    expect(canAccessFeatureSwitch('lead_ack_sms', 'basic', switches)).toBe(true)
  })
})

describe('sendLeadAckSmsIfEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isFeatureEnabledForOrg.mockResolvedValue(false)
    sendBrandedSms.mockResolvedValue({ sent: true, sid: 'SM123' })
  })

  it('does not send when feature switch is off', async () => {
    const { sendLeadAckSmsIfEnabled } = await import('../api/_lib/leadAckSms.js')

    const sent = await sendLeadAckSmsIfEnabled({
      orgId: 'org-1',
      leadId: 'lead-1',
      toPhone: '0412345678',
      customerName: 'Jane',
      source: 'sms',
    })

    expect(sent).toBe(false)
    expect(sendBrandedSms).not.toHaveBeenCalled()
  })

  it('sends when feature switch is on and phone is present', async () => {
    isFeatureEnabledForOrg.mockResolvedValue(true)
    const { sendLeadAckSmsIfEnabled } = await import('../api/_lib/leadAckSms.js')

    const sent = await sendLeadAckSmsIfEnabled({
      orgId: 'org-1',
      leadId: 'lead-1',
      toPhone: '0412345678',
      customerName: 'Jane',
      source: 'email',
    })

    expect(sent).toBe(true)
    expect(sendBrandedSms).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        leadId: 'lead-1',
        templateKey: 'lead_ack_sms',
        toPhone: '+61412345678',
        vars: { customerName: 'Jane', callbackWindow: 'within 2 business hours' },
        eventNote: 'Lead acknowledgement SMS sent',
        eventPayload: { source: 'email' },
      })
    )
  })

  it('skips send when phone is missing', async () => {
    isFeatureEnabledForOrg.mockResolvedValue(true)
    const { sendLeadAckSmsIfEnabled } = await import('../api/_lib/leadAckSms.js')

    const sent = await sendLeadAckSmsIfEnabled({
      orgId: 'org-1',
      leadId: 'lead-1',
      toPhone: '   ',
      source: 'email',
    })

    expect(sent).toBe(false)
    expect(sendBrandedSms).not.toHaveBeenCalled()
  })
})
