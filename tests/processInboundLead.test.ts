import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../api/_lib/notifyManagersNewLead.js', () => ({
  notifyManagersNewLead: vi.fn(),
}))

vi.mock('../api/_lib/leadAckSms.js', () => ({
  sendLeadAckSmsIfEnabled: vi.fn(),
}))

vi.mock('../api/_lib/missedCallHookbackSms.js', () => ({
  sendMissedCallHookbackIfEnabled: vi.fn().mockResolvedValue(true),
}))

const { mockRecorder } = vi.hoisted(() => ({
  mockRecorder: {
    step: vi.fn().mockResolvedValue(undefined),
    attachLead: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../api/_lib/workflowRun.js', () => ({
  NOOP_RECORDER: {
    step: vi.fn().mockResolvedValue(undefined),
    attachLead: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue(undefined),
  },
  startWorkflowRun: vi.fn().mockResolvedValue(mockRecorder),
}))

import { processInboundLead } from '../api/_lib/processInboundLead'
import { notifyManagersNewLead } from '../api/_lib/notifyManagersNewLead'
import { sendLeadAckSmsIfEnabled } from '../api/_lib/leadAckSms'
import { sendMissedCallHookbackIfEnabled } from '../api/_lib/missedCallHookbackSms'
import { startWorkflowRun } from '../api/_lib/workflowRun'
import * as rawFirstLead from '../api/_lib/rawFirstLead'

describe('processInboundLead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecorder.step.mockClear()
    mockRecorder.attachLead.mockClear()
    mockRecorder.finish.mockClear()
  })

  it('runs insert → created event → extract → notify → ack', async () => {
    const leadEventsInsert = vi.fn().mockResolvedValue({})
    const leadsUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const leadsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { name: 'SMS Lead: Pat', service_type: 'TV Aerial', status: 'unassigned' },
        }),
      }),
    })
    const from = vi.fn((table: string) => {
      if (table === 'lead_events') return { insert: leadEventsInsert }
      if (table === 'leads') return { select: leadsSelect, update: leadsUpdate }
      return {}
    })
    const supabase = { from } as unknown as Parameters<typeof processInboundLead>[0]['supabase']

    const updateSpy = vi.spyOn(rawFirstLead, 'updateLeadFromExtraction').mockResolvedValue()

    const result = await processInboundLead({
      supabase,
      orgId: 'org-1',
      insertLead: async () => ({ id: 'lead-1' }),
      createdEvent: {
        note: 'Lead captured from inbound SMS (raw-first)',
        payload: { source: 'sms', from: '+61400000000' },
      },
      extract: async () => ({
        updateFields: { name: 'SMS Lead: Pat', service_type: 'TV Aerial' },
        extractionStatus: 'succeeded',
      }),
      buildNotify: ({ savedLead }) => ({
        name: savedLead?.name || 'Pat',
        service_type: savedLead?.service_type || 'Other',
        status: savedLead?.status || 'unassigned',
      }),
      followUp: {
        type: 'ack',
        source: 'sms',
        resolvePhone: () => '+61400000000',
        resolveCustomerName: () => 'Pat',
      },
      logLabel: 'inbound SMS',
    })

    expect(result.leadId).toBe('lead-1')
    expect(leadEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'created', lead_id: 'lead-1' })
    )
    expect(updateSpy).toHaveBeenCalledWith(supabase, 'lead-1', {
      name: 'SMS Lead: Pat',
      service_type: 'TV Aerial',
    })
    expect(leadsUpdate).toHaveBeenCalledWith({ extraction_status: 'succeeded' })
    expect(notifyManagersNewLead).toHaveBeenCalled()
    expect(sendLeadAckSmsIfEnabled).toHaveBeenCalled()
    expect(sendMissedCallHookbackIfEnabled).not.toHaveBeenCalled()
  })

  it('skips extraction and sends hookback for missed-call style input', async () => {
    const leadEventsInsert = vi.fn().mockResolvedValue({})
    const leadsUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const leadsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { name: 'Missed Call', service_type: 'Other', status: 'unassigned' },
        }),
      }),
    })
    const from = vi.fn((table: string) => {
      if (table === 'lead_events') return { insert: leadEventsInsert }
      if (table === 'leads') return { select: leadsSelect, update: leadsUpdate }
      return {}
    })
    const supabase = { from } as unknown as Parameters<typeof processInboundLead>[0]['supabase']

    const updateSpy = vi.spyOn(rawFirstLead, 'updateLeadFromExtraction')

    const result = await processInboundLead({
      supabase,
      orgId: 'org-1',
      insertLead: async () => ({ id: 'lead-2' }),
      createdEvent: {
        note: 'Lead created from missed call',
        payload: { source: '3cx_missed_call' },
      },
      buildNotify: () => ({
        name: 'Missed Call',
        service_type: 'Other',
        status: 'unassigned',
      }),
      followUp: {
        type: 'hookback',
        source: '3cx_missed_call',
        resolvePhone: () => '+61411111111',
        resolveCustomerName: () => 'there',
      },
      logLabel: 'missed call',
    })

    expect(result.leadId).toBe('lead-2')
    expect(result.hookbackSent).toBe(true)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(leadsUpdate).toHaveBeenCalledWith({ extraction_status: 'skipped' })
    expect(sendMissedCallHookbackIfEnabled).toHaveBeenCalled()
    expect(sendLeadAckSmsIfEnabled).not.toHaveBeenCalled()
  })

  it('records workflow run steps when run input is provided', async () => {
    const leadEventsInsert = vi.fn().mockResolvedValue({ error: null })
    const leadsUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const leadsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { name: 'SMS Lead', service_type: 'TV Aerial', status: 'unassigned' },
        }),
      }),
    })
    const from = vi.fn((table: string) => {
      if (table === 'lead_events') return { insert: leadEventsInsert }
      if (table === 'leads') return { select: leadsSelect, update: leadsUpdate }
      return {}
    })
    const supabase = { from } as unknown as Parameters<typeof processInboundLead>[0]['supabase']

    vi.spyOn(rawFirstLead, 'updateLeadFromExtraction').mockResolvedValue()

    await processInboundLead({
      supabase,
      orgId: 'org-1',
      insertLead: async () => ({ id: 'lead-1' }),
      createdEvent: { note: 'created', payload: { source: 'sms' } },
      extract: async () => ({ updateFields: { name: 'SMS Lead' } }),
      buildNotify: () => ({ name: 'SMS Lead', service_type: 'TV Aerial', status: 'unassigned' }),
      logLabel: 'inbound SMS',
      run: {
        workflowKey: 'inbound_lead',
        triggerChannel: 'sms',
        triggerSummary: { identifier: '+611234', source: 'sms' },
      },
    })

    expect(startWorkflowRun).toHaveBeenCalled()
    expect(mockRecorder.attachLead).toHaveBeenCalledWith('lead-1')
    expect(mockRecorder.step).toHaveBeenCalledWith('insert_lead', 'succeeded')
    expect(mockRecorder.finish).toHaveBeenCalledWith('succeeded')
  })
})
