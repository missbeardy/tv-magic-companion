import { describe, expect, it, afterEach } from 'vitest'
import {
  looksLikePhoneNumber,
  resolveOrgIdFromCloudmailinWebhook,
  resolveOrgIdFromInboundEmail,
} from '../api/_lib/resolveOrgFromInboundEmail'

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

function mockSupabaseWebhook(options: { orgByTag?: string | null; orgByPhone?: string | null }) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'orgs') {
              return { data: options.orgByTag ? { id: options.orgByTag } : null }
            }
            if (table === 'org_phone_numbers') {
              return { data: options.orgByPhone ? { org_id: options.orgByPhone } : null }
            }
            return { data: null }
          },
        }),
      }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('looksLikePhoneNumber', () => {
  it('rejects 3CX extensions', () => {
    expect(looksLikePhoneNumber('166')).toBe(false)
  })

  it('accepts E.164 numbers', () => {
    expect(looksLikePhoneNumber('+61468050366')).toBe(true)
    expect(looksLikePhoneNumber('0468 050 366')).toBe(true)
  })
})

describe('resolveOrgIdFromCloudmailinWebhook', () => {
  it('prefers plus-tag over 3CX extension in body', async () => {
    const supabase = mockSupabaseWebhook({ orgByTag: 'tv-magic-org' })
    const result = await resolveOrgIdFromCloudmailinWebhook(
      supabase,
      { envelope: { to: '56465431321+default@cloudmailin.net' } },
      '166'
    )
    expect(result).toEqual({
      orgId: 'tv-magic-org',
      tag: 'default',
      source: 'plus_tag',
    })
  })

  it('falls back to DID when no plus-tag and called number is E.164', async () => {
    const supabase = mockSupabaseWebhook({ orgByPhone: 'tv-magic-org' })
    const result = await resolveOrgIdFromCloudmailinWebhook(
      supabase,
      { envelope: { to: '56465431321@cloudmailin.net' } },
      '+61468050366'
    )
    expect(result).toEqual({
      orgId: 'tv-magic-org',
      tag: null,
      source: 'phone_mapping',
    })
  })

  it('returns no_tag when only a 3CX extension is present', async () => {
    const supabase = mockSupabaseWebhook({})
    const result = await resolveOrgIdFromCloudmailinWebhook(
      supabase,
      { envelope: { to: '56465431321@cloudmailin.net' } },
      '166'
    )
    expect(result).toEqual({
      orgId: null,
      tag: null,
      source: 'unresolved',
      reason: 'no_tag',
    })
  })
})

describe('resolveOrgIdFromInboundEmail', () => {
  const originalDefault = process.env.DEFAULT_ORG_ID

  afterEach(() => {
    if (originalDefault === undefined) {
      delete process.env.DEFAULT_ORG_ID
    } else {
      process.env.DEFAULT_ORG_ID = originalDefault
    }
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

  it('returns unresolved when no plus-tag', async () => {
    process.env.DEFAULT_ORG_ID = 'default-org-uuid'
    const supabase = mockSupabase(null)
    const result = await resolveOrgIdFromInboundEmail(supabase, {
      envelope: { to: '56465431321@cloudmailin.net' },
    })
    expect(result).toEqual({
      orgId: null,
      tag: null,
      source: 'unresolved',
      reason: 'no_tag',
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
