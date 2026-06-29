import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { resolveOrgIdFromInboundEmail } from '../api/_lib/resolveOrgFromInboundEmail'

function mockSupabase(orgId: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: orgId ? { id: orgId } : null }),
        }),
      }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('resolveOrgIdFromInboundEmail', () => {
  const originalDefault = process.env.DEFAULT_ORG_ID

  beforeEach(() => {
    process.env.DEFAULT_ORG_ID = 'default-org-uuid'
  })

  afterEach(() => {
    process.env.DEFAULT_ORG_ID = originalDefault
  })

  it('resolves org from envelope plus-tag', async () => {
    const supabase = mockSupabase('org-a-uuid')
    const result = await resolveOrgIdFromInboundEmail(supabase, {
      envelope: { to: '56465431321+tv-magic-sydney@cloudmailin.net' },
    })
    expect(result).toEqual({
      orgId: 'org-a-uuid',
      tag: 'tv-magic-sydney',
      source: 'plus_tag',
    })
  })

  it('falls back to DEFAULT_ORG_ID when no plus-tag', async () => {
    const supabase = mockSupabase(null)
    const result = await resolveOrgIdFromInboundEmail(supabase, {
      envelope: { to: '56465431321@cloudmailin.net' },
    })
    expect(result).toEqual({
      orgId: 'default-org-uuid',
      tag: null,
      source: 'default_org',
    })
  })

  it('returns unresolved for unknown tag', async () => {
    const supabase = mockSupabase(null)
    const result = await resolveOrgIdFromInboundEmail(supabase, {
      envelope: { to: '56465431321+unknown@cloudmailin.net' },
    })
    expect(result).toEqual({
      orgId: null,
      tag: 'unknown',
      source: 'unresolved',
      reason: 'unknown_tag',
    })
  })
})
