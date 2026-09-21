import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { AuthContext } from '../api/_lib/auth'
import { isFeatureEnabledForOrg } from '../api/_lib/featureSwitches'
import { getSupabaseAdmin } from '../api/_lib/supabaseAdmin'
import { sendTwilioSms } from '../api/_lib/twilioSend'
import { handleSmsReply } from '../api/_lib/smsReply'

vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: vi.fn(),
}))

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('../api/_lib/twilioSend.js', () => ({
  sendTwilioSms: vi.fn(),
}))

const mockFeature = vi.mocked(isFeatureEnabledForOrg)
const mockAdmin = vi.mocked(getSupabaseAdmin)
const mockSend = vi.mocked(sendTwilioSms)

function auth(orgId = 'org-a'): AuthContext {
  return {
    userId: 'user-1',
    email: 'pat@example.com',
    fullName: 'Pat',
    role: 'employee',
    orgId,
    org: { id: orgId, name: 'Demo' },
    brand: null,
  } as AuthContext
}

function createRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
  }
  return res as unknown as VercelResponse & { statusCode: number; body: unknown }
}

function createReq(body: Record<string, unknown>): VercelRequest {
  return { method: 'POST', body } as VercelRequest
}

describe('handleSmsReply', () => {
  beforeEach(() => {
    mockFeature.mockImplementation(async (_org, key) => key === 'two_way_sms')
    mockSend.mockResolvedValue({ sent: true, sid: 'SMreply' })
  })

  it('returns 404 when the lead is missing', async () => {
    mockAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as never)

    const res = createRes()
    await handleSmsReply(createReq({ leadId: 'missing', message: 'Hi' }), res, auth())
    expect(res.statusCode).toBe(404)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('returns 403 when the lead belongs to another org', async () => {
    mockAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({
                data: { id: 'lead-1', org_id: 'org-other', phone: '+61412345678' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as never)

    const res = createRes()
    await handleSmsReply(createReq({ leadId: 'lead-1', message: 'Hi' }), res, auth('org-a'))
    expect(res.statusCode).toBe(403)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sends from the org sender and logs sms_sent', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === 'leads') {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'lead-1', org_id: 'org-a', phone: '0412345678' },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'lead_events') return { insert }
        throw new Error(`unexpected ${table}`)
      },
    } as never)

    const res = createRes()
    await handleSmsReply(createReq({ leadId: 'lead-1', message: 'On my way' }), res, auth())
    expect(res.statusCode).toBe(200)
    expect(mockSend).toHaveBeenCalledWith({
      orgId: 'org-a',
      to: '0412345678',
      body: 'On my way',
    })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: 'lead-1',
        event_type: 'sms_sent',
        note: 'On my way',
      })
    )
  })
})
