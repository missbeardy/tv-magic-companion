import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: vi.fn(),
}))

import { MANAGER_ROLES, requireRole } from '../api/_lib/auth'
import { getSupabaseAdmin } from '../api/_lib/supabaseAdmin'

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin)

function mockRes() {
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

function mockReq(authorization?: string): VercelRequest {
  return { headers: authorization ? { authorization } : {} } as unknown as VercelRequest
}

function mockSupabase(opts: {
  getUser?: { data: { user: { id: string } } | null; error: unknown }
  profile?: { data: { role: string; org_id: string | null } | null; error: unknown }
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue(opts.getUser ?? { data: { user: { id: 'u1' } }, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue(opts.profile ?? { data: { role: 'manager', org_id: 'org-1' }, error: null }),
        })),
      })),
    })),
  }
}

describe('MANAGER_ROLES', () => {
  it('is exactly manager and platform_admin', () => {
    expect(MANAGER_ROLES).toEqual(['manager', 'platform_admin'])
  })
})

describe('requireRole (AUD-20)', () => {
  beforeEach(() => {
    mockGetSupabaseAdmin.mockReset()
  })

  it('401s when the server has no admin client', async () => {
    mockGetSupabaseAdmin.mockReturnValue(null)
    const res = mockRes()
    const result = await requireRole(mockReq('Bearer t'), res, MANAGER_ROLES)
    expect(result).toBeNull()
    expect(res.statusCode).toBe(500)
  })

  it('401s when no token is present', async () => {
    mockGetSupabaseAdmin.mockReturnValue(mockSupabase({}) as never)
    const res = mockRes()
    const result = await requireRole(mockReq(), res, MANAGER_ROLES)
    expect(result).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('401s when the token does not resolve a user', async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      mockSupabase({ getUser: { data: { user: null } as never, error: null } }) as never
    )
    const res = mockRes()
    const result = await requireRole(mockReq('Bearer bad'), res, MANAGER_ROLES)
    expect(result).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('403s when no profile is found', async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      mockSupabase({ profile: { data: null, error: { message: 'not found' } } }) as never
    )
    const res = mockRes()
    const result = await requireRole(mockReq('Bearer t'), res, MANAGER_ROLES)
    expect(result).toBeNull()
    expect(res.statusCode).toBe(403)
  })

  it('403s with the custom message when the role is not allowed', async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      mockSupabase({ profile: { data: { role: 'employee', org_id: 'org-1' }, error: null } }) as never
    )
    const res = mockRes()
    const result = await requireRole(mockReq('Bearer t'), res, MANAGER_ROLES, 'Only managers can do this')
    expect(result).toBeNull()
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'Only managers can do this' })
  })

  it('returns the caller for an allowed role, org-less platform_admin included', async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      mockSupabase({ profile: { data: { role: 'platform_admin', org_id: null }, error: null } }) as never
    )
    const res = mockRes()
    const result = await requireRole(mockReq('Bearer t'), res, ['platform_admin'])
    expect(result).toEqual({ userId: 'u1', role: 'platform_admin', orgId: null })
    expect(res.statusCode).toBe(0)
  })
})
