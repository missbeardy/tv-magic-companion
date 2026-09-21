import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { AuthContext } from '../api/_lib/auth'
import { canSendInvoice } from '../api/_lib/invoiceAccess'

vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: vi.fn().mockResolvedValue(true),
}))

import { handleInvoiceSendEmail } from '../api/send-sms'

function auth(role: string): AuthContext {
  return {
    userId: 'user-1',
    email: 'pat@example.com',
    fullName: 'Pat',
    role,
    orgId: 'org-a',
    org: { id: 'org-a', name: 'Demo' },
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

describe('canSendInvoice', () => {
  it('allows manager, employee and platform_admin', () => {
    expect(canSendInvoice('manager')).toBe(true)
    expect(canSendInvoice('employee')).toBe(true)
    expect(canSendInvoice('platform_admin')).toBe(true)
  })

  it('rejects the role that does not exist', () => {
    expect(canSendInvoice('technician')).toBe(false)
  })
})

describe('handleInvoiceSendEmail role gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lets an employee through the role gate (400 for missing fields is a pass)', async () => {
    const res = createRes()
    await handleInvoiceSendEmail(createReq({}), res, auth('employee'))
    expect(res.statusCode).toBe(400)
    expect(String((res.body as { error?: string }).error)).toMatch(/Missing invoice fields/i)
  })

  it('rejects the dead technician role', async () => {
    const res = createRes()
    await handleInvoiceSendEmail(createReq({}), res, auth('technician'))
    expect(res.statusCode).toBe(403)
    expect(String((res.body as { error?: string }).error)).toMatch(/Only team members/i)
  })
})
