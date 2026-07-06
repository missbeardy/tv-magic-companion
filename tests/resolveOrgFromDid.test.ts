import { describe, expect, it, afterEach } from 'vitest'
import { resolveOrgIdFromDid, normalizeDidForLookup } from '../api/_lib/resolveOrgFromDid'

function mockSupabase(orgId: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: orgId ? { org_id: orgId } : null }),
        }),
      }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('normalizeDidForLookup', () => {
  it('normalizes AU local format to E.164', () => {
    expect(normalizeDidForLookup('0412 345 678')).toBe('+61412345678')
  })
})

describe('resolveOrgIdFromDid', () => {
  const originalDefault = process.env.DEFAULT_ORG_ID

  afterEach(() => {
    if (originalDefault === undefined) {
      delete process.env.DEFAULT_ORG_ID
    } else {
      process.env.DEFAULT_ORG_ID = originalDefault
    }
  })

  it('resolves org from phone mapping', async () => {
    const supabase = mockSupabase('org-a-uuid')
    const result = await resolveOrgIdFromDid(supabase, '0412345678')
    expect(result).toEqual({ orgId: 'org-a-uuid', source: 'phone_mapping' })
  })

  it('returns unresolved when no mapping', async () => {
    process.env.DEFAULT_ORG_ID = 'default-org-uuid'
    const supabase = mockSupabase(null)
    const result = await resolveOrgIdFromDid(supabase, '0412345678')
    expect(result).toEqual({ orgId: null, source: 'unresolved' })
  })

  it('returns unresolved when called number is empty', async () => {
    const supabase = mockSupabase(null)
    const result = await resolveOrgIdFromDid(supabase, '')
    expect(result).toEqual({ orgId: null, source: 'unresolved' })
  })
})
