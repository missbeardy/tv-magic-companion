import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { AuthContext } from '../api/_lib/auth'
import { getSupabaseAdmin } from '../api/_lib/supabaseAdmin'
import { sendBookingConfirmations } from '../api/_lib/bookingConfirm'

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: vi.fn(),
}))
vi.mock('../api/_lib/bookingConfirm.js', () => ({
  sendBookingConfirmations: vi.fn(),
}))
vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: vi.fn().mockResolvedValue(true),
}))

import { handleBookingConfirm } from '../api/send-sms'

const mockAdmin = vi.mocked(getSupabaseAdmin)
const mockSendConfirmations = vi.mocked(sendBookingConfirmations)

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

function createReq(body: Record<string, unknown> = {}): VercelRequest {
  return { method: 'POST', headers: {}, body, query: {} } as unknown as VercelRequest
}

function mockLead(row: Record<string, unknown> | null) {
  mockAdmin.mockReturnValue({
    from: (table: string) => {
      if (table !== 'leads') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
      }
    },
  } as never)
}

describe('handleBookingConfirm — closes the relay (AUD-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendConfirmations.mockResolvedValue({
      smsSent: true,
      smsMessage: 'sent',
      emailSent: false,
      emailMessage: 'skipped',
    })
  })

  it('400s when leadId is missing', async () => {
    const res = createRes()
    await handleBookingConfirm(
      createReq({ startTimeIso: '2026-09-22T00:00:00Z', endTimeIso: '2026-09-22T01:00:00Z' }),
      res,
      auth()
    )
    expect(res.statusCode).toBe(400)
    expect(String((res.body as { error?: string }).error)).toMatch(/leadId is required/i)
    expect(mockAdmin).not.toHaveBeenCalled()
  })

  it('403s when the lead belongs to a different org', async () => {
    mockLead({ org_id: 'org-b', name: 'Jane', phone: '+61400000000', email: null, address: null, service_type: 'Repair' })
    const res = createRes()
    await handleBookingConfirm(
      createReq({
        leadId: 'lead-1',
        startTimeIso: '2026-09-22T00:00:00Z',
        endTimeIso: '2026-09-22T01:00:00Z',
      }),
      res,
      auth('org-a')
    )
    expect(res.statusCode).toBe(403)
    expect(String((res.body as { error?: string }).error)).toMatch(/outside your organisation/i)
    expect(mockSendConfirmations).not.toHaveBeenCalled()
  })

  it('403s when the lead does not exist at all', async () => {
    mockLead(null)
    const res = createRes()
    await handleBookingConfirm(
      createReq({
        leadId: 'missing-lead',
        startTimeIso: '2026-09-22T00:00:00Z',
        endTimeIso: '2026-09-22T01:00:00Z',
      }),
      res,
      auth('org-a')
    )
    expect(res.statusCode).toBe(403)
    expect(mockSendConfirmations).not.toHaveBeenCalled()
  })

  it('ignores customer identity fields from the body and uses the lead row instead', async () => {
    mockLead({
      org_id: 'org-a',
      name: 'Real Customer',
      phone: '+61400111222',
      email: 'real@example.com',
      address: '1 Real St',
      service_type: 'TV Aerial',
    })
    const res = createRes()
    await handleBookingConfirm(
      createReq({
        leadId: 'lead-1',
        startTimeIso: '2026-09-22T00:00:00Z',
        endTimeIso: '2026-09-22T01:00:00Z',
        techName: 'Sam',
        // Everything below is attacker/stale-client controlled and must be ignored.
        customerName: 'Someone Else',
        customerPhone: '+61499999999',
        customerEmail: 'attacker@example.com',
        serviceType: 'Fake Service',
        address: '999 Fake Ave',
      }),
      res,
      auth('org-a')
    )

    expect(res.statusCode).toBe(200)
    expect(mockSendConfirmations).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-a',
        leadId: 'lead-1',
        customerName: 'Real Customer',
        customerPhone: '+61400111222',
        customerEmail: 'real@example.com',
        serviceType: 'TV Aerial',
        address: '1 Real St',
        techName: 'Sam',
      })
    )
  })
})
