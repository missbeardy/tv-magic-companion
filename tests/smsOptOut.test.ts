import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyInboundSmsOptOut,
  matchSmsOptOutCommand,
} from '../api/_lib/smsOptOut'
import { sendBrandedSms } from '../api/_lib/sendBrandedSms'
import { getSupabaseAdmin } from '../api/_lib/supabaseAdmin'

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: vi.fn(),
}))

const mockAdmin = vi.mocked(getSupabaseAdmin)

type QueryResult = { data: unknown; error: null }

function createQuery(result: QueryResult) {
  const query: Record<string, unknown> = {}
  const self = () => query
  query.select = self
  query.eq = self
  query.in = self
  query.is = self
  query.then = (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve)
  query.maybeSingle = async () => result
  query.upsert = vi.fn().mockResolvedValue({ error: null })
  query.insert = vi.fn().mockResolvedValue({ error: null })
  query.delete = vi.fn().mockReturnValue({
    eq: () => ({ eq: async () => ({ error: null }) }),
  })
  return query
}

describe('matchSmsOptOutCommand', () => {
  it('matches STOP variants', () => {
    expect(matchSmsOptOutCommand('STOP')).toBe('stop')
    expect(matchSmsOptOutCommand(' stopall ')).toBe('stop')
    expect(matchSmsOptOutCommand('unsubscribe')).toBe('stop')
    expect(matchSmsOptOutCommand('opt out')).toBe('stop')
    expect(matchSmsOptOutCommand('optout')).toBe('stop')
  })

  it('matches START variants', () => {
    expect(matchSmsOptOutCommand('START')).toBe('start')
    expect(matchSmsOptOutCommand('unstop')).toBe('start')
    expect(matchSmsOptOutCommand('yes')).toBe('yes')
  })

  it('ignores ordinary enquiries', () => {
    expect(matchSmsOptOutCommand('yes please come Tuesday')).toBeNull()
    expect(matchSmsOptOutCommand('Hi can you quote a wall mount')).toBeNull()
  })
})

describe('applyInboundSmsOptOut', () => {
  it('STOP creates no lead path — handled, upsertes opt-out', async () => {
    const optOuts = createQuery({ data: null, error: null })
    const leads = createQuery({ data: [{ id: 'lead-1' }], error: null })
    const events = createQuery({ data: null, error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'sms_opt_outs') return optOuts
        if (table === 'leads') return leads
        if (table === 'lead_events') return events
        throw new Error(`unexpected ${table}`)
      }),
    }

    const result = await applyInboundSmsOptOut({
      supabase: supabase as never,
      orgId: 'org-a',
      fromNumber: '0412345678',
      smsText: 'STOP',
    })

    expect(result).toBe('handled')
    expect(optOuts.upsert).toHaveBeenCalled()
    expect(events.insert).toHaveBeenCalled()
  })

  it('YES does not opt-in when the number is not suppressed', async () => {
    const optOuts = createQuery({ data: null, error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'sms_opt_outs') return optOuts
        throw new Error(`unexpected ${table}`)
      }),
    }

    const result = await applyInboundSmsOptOut({
      supabase: supabase as never,
      orgId: 'org-a',
      fromNumber: '0412345678',
      smsText: 'yes',
    })

    expect(result).toBe('ignored')
    expect(optOuts.delete).not.toHaveBeenCalled()
  })

  it('START re-enables a suppressed number', async () => {
    const optOuts = createQuery({ data: { phone: '+61412345678' }, error: null })
    const deleteEq2 = vi.fn().mockResolvedValue({ error: null })
    const deleteEq1 = vi.fn().mockReturnValue({ eq: deleteEq2 })
    optOuts.delete = vi.fn().mockReturnValue({ eq: deleteEq1 })

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'sms_opt_outs') return optOuts
        throw new Error(`unexpected ${table}`)
      }),
    }

    const result = await applyInboundSmsOptOut({
      supabase: supabase as never,
      orgId: 'org-a',
      fromNumber: '0412345678',
      smsText: 'START',
    })

    expect(result).toBe('handled')
    expect(optOuts.delete).toHaveBeenCalled()
  })
})

describe('sendBrandedSms opt-out suppression', () => {
  const env = process.env

  beforeEach(() => {
    process.env = {
      ...env,
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+611300000000',
    }
    vi.stubGlobal('fetch', vi.fn())
  })

  it('skips Twilio when the destination is opted out', async () => {
    const optOuts = createQuery({ data: { phone: '+61412345678' }, error: null })
    mockAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === 'sms_opt_outs') return optOuts
        throw new Error(`unexpected ${table}`)
      },
    } as never)

    const result = await sendBrandedSms({
      orgId: 'org-a',
      toPhone: '0412345678',
      templateKey: 'lead_ack',
      vars: {},
      fallbackMessage: 'Thanks',
    })

    expect(result).toEqual({ sent: false, skipped: 'opted_out' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('inbound SMS wires STOP before lead insert', () => {
  it('calls applyInboundSmsOptOut from finishInboundSms', () => {
    const source = readFileSync(resolve(__dirname, '../api/inbound-sms.ts'), 'utf8')
    expect(source).toContain('await applyInboundSmsOptOut')
    expect(source.indexOf('await applyInboundSmsOptOut')).toBeLessThan(
      source.indexOf('processInboundLead({')
    )
  })
})
