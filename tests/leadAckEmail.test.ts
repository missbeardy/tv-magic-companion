import { describe, expect, it, vi, beforeEach } from 'vitest'

const isFeatureEnabledForOrg = vi.fn()
const sendTransactionalEmail = vi.fn()

vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: (...args: unknown[]) => isFeatureEnabledForOrg(...args),
}))

vi.mock('../api/_lib/sendTransactionalEmail.js', () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendTransactionalEmail(...args),
}))

const orgRow = {
  name: 'FieldBourne',
  brand_id: 'brand-1',
  support_phone: '0412 345 678',
}

const brandRow = {
  email_templates: {},
}

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'orgs') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: orgRow }),
            }),
          }),
        }
      }
      if (table === 'brands') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: brandRow }),
            }),
          }),
        }
      }
      if (table === 'lead_events') {
        return { insert: vi.fn().mockResolvedValue({}) }
      }
      return {}
    },
  }),
}))

describe('sendLeadAckEmailIfEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isFeatureEnabledForOrg.mockResolvedValue(false)
    sendTransactionalEmail.mockResolvedValue({ sent: true, message: 'ok' })
  })

  it('does not send when feature switch is off', async () => {
    const { sendLeadAckEmailIfEnabled } = await import('../api/_lib/leadAckEmail.js')

    const sent = await sendLeadAckEmailIfEnabled({
      orgId: 'org-1',
      leadId: 'lead-1',
      toEmail: 'pat@example.com',
      source: 'email',
    })

    expect(sent).toBe(false)
    expect(sendTransactionalEmail).not.toHaveBeenCalled()
  })

  it('sends branded ack email when switch is on', async () => {
    isFeatureEnabledForOrg.mockResolvedValue(true)
    const { sendLeadAckEmailIfEnabled } = await import('../api/_lib/leadAckEmail.js')

    const sent = await sendLeadAckEmailIfEnabled({
      orgId: 'org-1',
      leadId: 'lead-1',
      toEmail: 'pat@example.com',
      customerName: 'Pat',
      source: 'email',
    })

    expect(sent).toBe(true)
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'pat@example.com',
        subject: expect.stringContaining('FieldBourne'),
        html: expect.stringContaining('within 2 business hours'),
      })
    )
  })
})
