import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findOpenLeadByPhone } from '../api/_lib/inboundLeadDedup'
import { threadInboundSms } from '../api/_lib/threadInboundSms'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const insertTrustedCustomerReply = vi.fn()
const startWorkflowRun = vi.fn()

vi.mock('../api/_lib/notifyUser.js', () => ({
  insertTrustedCustomerReply: (...args: unknown[]) => insertTrustedCustomerReply(...args),
}))

vi.mock('../api/_lib/workflowRun.js', () => ({
  startWorkflowRun: (...args: unknown[]) => startWorkflowRun(...args),
}))

vi.mock('../api/_lib/platformUrl.js', () => ({
  getPlatformUrl: () => 'https://app.example.test',
}))

function mockOpenLeadQuery(rows: Array<{ id: string; assigned_to: string | null }>) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.is.mockReturnValue(query)
  query.not.mockReturnValue(query)
  query.gte.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockResolvedValue({ data: rows, error: null })
  return query
}

describe('findOpenLeadByPhone', () => {
  it('returns the most recent open lead for matching phone candidates', async () => {
    const query = mockOpenLeadQuery([{ id: 'lead-open', assigned_to: 'tech-1' }])
    const supabase = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient
    const result = await findOpenLeadByPhone(supabase, '0412345678', 'org-a')
    expect(result).toEqual({ id: 'lead-open', assigned_to: 'tech-1' })
    expect(query.not).toHaveBeenCalledWith('status', 'in', '(completed,lost,booking_cancelled)')
  })

  it('returns null when no open lead exists', async () => {
    const query = mockOpenLeadQuery([])
    const supabase = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient
    await expect(findOpenLeadByPhone(supabase, '+61412345678', 'org-a')).resolves.toBeNull()
  })
})

describe('threadInboundSms', () => {
  beforeEach(() => {
    insertTrustedCustomerReply.mockReset()
    insertTrustedCustomerReply.mockResolvedValue({ ok: true })
    startWorkflowRun.mockReset()
    startWorkflowRun.mockResolvedValue({
      attachLead: vi.fn().mockResolvedValue(undefined),
      step: vi.fn().mockResolvedValue(undefined),
      finish: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('returns null when there is no open lead', async () => {
    const query = mockOpenLeadQuery([])
    const supabase = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient
    const result = await threadInboundSms({
      supabase,
      orgId: 'org-a',
      fromNumber: '+61412345678',
      smsText: 'Can you come tomorrow?',
      toNumber: '+61468050366',
    })
    expect(result).toBeNull()
    expect(insertTrustedCustomerReply).not.toHaveBeenCalled()
  })

  it('logs sms_received, notifies the assignee, and records thread_existing', async () => {
    const openQuery = mockOpenLeadQuery([{ id: 'lead-open', assigned_to: 'tech-1' }])
    const eventsInsert = vi.fn().mockResolvedValue({ error: null })
    const leadsUpdate = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }
    let leadSelects = 0
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'lead_events') return { insert: eventsInsert }
        if (table === 'leads') {
          leadSelects += 1
          return leadSelects === 1 ? openQuery : leadsUpdate
        }
        throw new Error(`unexpected ${table}`)
      }),
    } as unknown as SupabaseClient

    const result = await threadInboundSms({
      supabase,
      orgId: 'org-a',
      fromNumber: '+61412345678',
      smsText: 'Can you come tomorrow?',
      toNumber: '+61468050366',
    })

    expect(result).toEqual({ leadId: 'lead-open' })
    expect(eventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: 'lead-open',
        org_id: 'org-a',
        event_type: 'sms_received',
        note: 'Can you come tomorrow?',
      })
    )
    expect(insertTrustedCustomerReply).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'tech-1',
        leadId: 'lead-open',
        title: 'Customer replied by SMS',
      })
    )
    const recorder = await startWorkflowRun.mock.results[0].value
    expect(recorder.step).toHaveBeenCalledWith(
      'thread_existing',
      'succeeded',
      expect.objectContaining({ output: { leadId: 'lead-open' } })
    )
  })
})

describe('inbound SMS threading order', () => {
  it('threads onto an existing lead before creating a new one', () => {
    const source = readFileSync(resolve(__dirname, '../api/inbound-sms.ts'), 'utf8')
    expect(source).toContain('threadInboundSms')
    expect(source.indexOf('threadInboundSms')).toBeLessThan(source.indexOf('processInboundLead({'))
    expect(source).not.toMatch(/INBOUND_LEAD_STEP_IDS/)
  })
})
