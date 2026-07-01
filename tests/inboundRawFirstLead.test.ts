import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const applySoloInboundAssignment = vi.fn(async (_s: unknown, _o: unknown, payload: unknown) => payload)

vi.mock('../api/_lib/soloInboundLead.js', () => ({
  applySoloInboundAssignment: (...args: unknown[]) => applySoloInboundAssignment(...args),
}))

import * as rawFirstLead from '../api/_lib/rawFirstLead'

const ROOT = resolve(import.meta.dirname, '..')

function readApiSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
}

/** Symbols each inbound handler imports from rawFirstLead — missing exports caused prod 500s. */
const INBOUND_RAW_FIRST_IMPORTS = {
  'api/inbound-sms.ts': ['insertRawFirstLead', 'updateLeadFromExtraction'],
  'api/inbound-email.ts': [
    'emailFallbackParse',
    'insertRawFirstLead',
    'parseEmailSender',
    'updateLeadFromExtraction',
  ],
  'api/inbound-voicemail.ts': ['insertRawFirstLead', 'updateLeadFromExtraction'],
} as const

describe('inbound raw-first module bundle', () => {
  it('rawFirstLead.ts exists and exports insertRawFirstLead', () => {
    expect(typeof rawFirstLead.insertRawFirstLead).toBe('function')
    expect(typeof rawFirstLead.updateLeadFromExtraction).toBe('function')
  })

  for (const [handlerPath, symbols] of Object.entries(INBOUND_RAW_FIRST_IMPORTS)) {
    it(`${handlerPath} imports resolve to exported functions`, () => {
      const source = readApiSource(handlerPath)
      expect(source).toContain("from './_lib/rawFirstLead.js'")

      for (const symbol of symbols) {
        expect(source).toMatch(new RegExp(`\\b${symbol}\\b`))
        expect(rawFirstLead).toHaveProperty(symbol)
        expect(typeof (rawFirstLead as Record<string, unknown>)[symbol]).toBe('function')
      }
    })
  }

  it('insertRawFirstLead persists a lead and returns its id', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'lead-abc' }, error: null }),
      }),
    })
    const from = vi.fn().mockReturnValue({ insert })
    const supabase = { from } as unknown as Parameters<typeof rawFirstLead.insertRawFirstLead>[0]

    const result = await rawFirstLead.insertRawFirstLead(supabase, 'org-1', {
      org_id: 'org-1',
      name: 'Jane',
      phone: '0400000000',
      service_type: 'TV Aerial',
      details: 'Need install',
      source: 'sms',
      raw_sms: 'Need install',
    })

    expect(result).toEqual({ id: 'lead-abc' })
    expect(from).toHaveBeenCalledWith('leads')
    expect(insert).toHaveBeenCalled()
    expect(applySoloInboundAssignment).toHaveBeenCalled()
  })

  it('insertRawFirstLead throws when insert returns no id', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
      }),
    })
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as unknown as Parameters<
      typeof rawFirstLead.insertRawFirstLead
    >[0]

    await expect(
      rawFirstLead.insertRawFirstLead(supabase, 'org-1', {
        org_id: 'org-1',
        name: 'Jane',
        service_type: 'General',
        details: 'Hi',
        source: 'sms',
      })
    ).rejects.toThrow(/no id/)
  })
})
