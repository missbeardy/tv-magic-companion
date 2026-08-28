import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  findDuplicateFacebookMessengerLead,
  parseConversationId,
} from '../api/_lib/inboundLeadDedup'

function mockLeadsQuery(rows: Array<{ id: string; raw_email: string | null; phone: string }>) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.is.mockReturnValue(query)
  query.gte.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockResolvedValue({ data: rows, error: null })
  const from = vi.fn().mockReturnValue(query)
  return { from } as unknown as SupabaseClient
}

describe('parseConversationId', () => {
  it('accepts Botpress-style ids', () => {
    expect(parseConversationId('conv_abc123')).toBe('conv_abc123')
  })

  it('rejects empty or unsafe values', () => {
    expect(parseConversationId('')).toBeNull()
    expect(parseConversationId('abc;drop')).toBeNull()
    expect(parseConversationId('a'.repeat(129))).toBeNull()
  })
})

describe('findDuplicateFacebookMessengerLead', () => {
  it('does not query when conversation_id is missing (live structured bot)', async () => {
    const supabase = mockLeadsQuery([])
    const result = await findDuplicateFacebookMessengerLead(
      supabase,
      'org-1',
      'facebook_messenger',
      null,
      '+61412345678'
    )
    expect(result).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('matches the same conversation_id in raw_email', async () => {
    const supabase = mockLeadsQuery([
      {
        id: 'lead-1',
        phone: '+61412345678',
        raw_email: JSON.stringify({ conversation_id: 'conv_abc123' }),
      },
    ])
    const result = await findDuplicateFacebookMessengerLead(
      supabase,
      'org-1',
      'facebook_messenger',
      'conv_abc123',
      '+61400000000'
    )
    expect(result).toEqual({ id: 'lead-1' })
  })

  it('falls back to the same phone within the window', async () => {
    const supabase = mockLeadsQuery([
      {
        id: 'lead-phone',
        phone: '+61412345678',
        raw_email: JSON.stringify({ conversation_id: 'other' }),
      },
    ])
    const result = await findDuplicateFacebookMessengerLead(
      supabase,
      'org-1',
      'facebook_messenger',
      'conv_new',
      '+61412345678'
    )
    expect(result).toEqual({ id: 'lead-phone' })
  })
})
