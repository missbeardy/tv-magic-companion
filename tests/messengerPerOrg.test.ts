import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMessengerSystemPrompt } from '../api/_lib/messengerKb'
import { loadOrgMessengerConfig } from '../api/_lib/messengerClaude'
import { captureUnroutedInbound } from '../api/_lib/captureUnroutedInbound'

vi.mock('../api/_lib/captureUnroutedInbound.js', () => ({
  captureUnroutedInbound: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../api/_lib/messengerSession.js', () => ({
  loadOrCreateMessengerSession: vi.fn(),
  saveMessengerSession: vi.fn(),
}))

import { loadOrCreateMessengerSession } from '../api/_lib/messengerSession'
import { handleMessengerUserMessage } from '../api/_lib/messengerBot'

const mockLoadSession = vi.mocked(loadOrCreateMessengerSession)
const mockCapture = vi.mocked(captureUnroutedInbound)

function orgRow(overrides: Record<string, unknown> = {}) {
  return {
    name: 'FieldBourne Digital',
    messenger_business_name: null,
    messenger_contact_phone: null,
    service_area_note: null,
    ai_context: null,
    service_types: [],
    timezone: 'Australia/Sydney',
    ...overrides,
  }
}

function supabaseWithOrg(row: Record<string, unknown> | null) {
  return {
    from: (table: string) => {
      if (table !== 'orgs') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
      }
    },
  }
}

describe('buildMessengerSystemPrompt — no hardcoded brand or number', () => {
  it('uses the supplied org identity, not a fixed franchise', () => {
    const prompt = buildMessengerSystemPrompt({
      businessName: 'Ace Plumbing',
      contactPhone: '0400 555 666',
      timezone: 'Australia/Melbourne',
      serviceTypes: ['Blocked Drains', 'Hot Water'],
      serviceAreaNote: 'Melbourne metro only.',
      aiContext: 'Family-run since 1998.',
    })
    expect(prompt).toContain('Ace Plumbing')
    expect(prompt).toContain('0400 555 666')
    expect(prompt).toContain('Australia/Melbourne')
    expect(prompt).toContain('Blocked Drains')
    expect(prompt).toContain('Melbourne metro only.')
    expect(prompt).toContain('Family-run since 1998.')
    expect(prompt).not.toMatch(/TV Magic/i)
    expect(prompt).not.toContain('0449 947 247')
  })

  it('falls back to a generic services line when service_types is empty', () => {
    const prompt = buildMessengerSystemPrompt({
      businessName: 'X',
      contactPhone: '000',
      timezone: 'Australia/Brisbane',
      serviceTypes: [],
      serviceAreaNote: null,
      aiContext: null,
    })
    expect(prompt).toContain('the services this business offers')
  })
})

describe('loadOrgMessengerConfig — fails closed without a real DB', () => {
  it('returns null when messenger_contact_phone is unset', async () => {
    const supabase = supabaseWithOrg(orgRow())
    const config = await loadOrgMessengerConfig(supabase as never, 'org-1')
    expect(config).toBeNull()
  })

  it('returns a config when messenger_contact_phone is set, falling back to org name', async () => {
    const supabase = supabaseWithOrg(orgRow({ messenger_contact_phone: '0400 555 666' }))
    const config = await loadOrgMessengerConfig(supabase as never, 'org-1')
    expect(config).toEqual(
      expect.objectContaining({ businessName: 'FieldBourne Digital', contactPhone: '0400 555 666' })
    )
  })
})

describe('handleMessengerUserMessage — fail closed for an unconfigured org (AUD-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips the AI and session entirely, logging to unrouted_inbound', async () => {
    const supabase = supabaseWithOrg(orgRow())

    const result = await handleMessengerUserMessage(supabase as never, 'org-1', 'page-1', 'psid-1', 'hi there')

    expect(result).toEqual({ replies: [], submitted: false, leadId: null })
    expect(mockLoadSession).not.toHaveBeenCalled()
    expect(mockCapture).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ channel: 'messenger', reason: 'not_configured' })
    )
  })
})
