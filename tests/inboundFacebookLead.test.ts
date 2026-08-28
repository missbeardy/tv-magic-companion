import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: vi.fn(),
}))

vi.mock('../api/_lib/captureUnroutedInbound.js', () => ({
  captureUnroutedInbound: vi.fn(),
}))

vi.mock('../api/_lib/processInboundLead.js', () => ({
  processInboundLead: vi.fn(),
}))

vi.mock('../api/_lib/inboundLeadDedup.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/_lib/inboundLeadDedup.js')>()
  return {
    ...actual,
    findDuplicateFacebookMessengerLead: vi.fn(),
  }
})

import {
  parseFacebookLeadBody,
  buildFacebookLeadDetails,
  facebookLeadFallbackParse,
  handleInboundFacebookLead,
  assembleMessengerLeadDetails,
  inferFacebookServiceType,
} from '../api/_lib/handleInboundFacebookLead'
import { isFeatureEnabledForOrg } from '../api/_lib/featureSwitches'
import { captureUnroutedInbound } from '../api/_lib/captureUnroutedInbound'
import { processInboundLead } from '../api/_lib/processInboundLead'
import { findDuplicateFacebookMessengerLead } from '../api/_lib/inboundLeadDedup'

const mockIsFeatureEnabled = vi.mocked(isFeatureEnabledForOrg)
const mockCaptureUnrouted = vi.mocked(captureUnroutedInbound)
const mockProcessInboundLead = vi.mocked(processInboundLead)
const mockFindDuplicate = vi.mocked(findDuplicateFacebookMessengerLead)

const unsetAgentFields = {
  conversation_id: null,
  suburb: null,
  service_needed: null,
  out_of_area: false,
}

function mockRes() {
  const res = {
    statusCode: 200,
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

function mockReq(
  overrides: Partial<{
    method: string
    headers: Record<string, string>
    body: unknown
  }> = {}
): VercelRequest {
  return {
    method: overrides.method ?? 'POST',
    headers: overrides.headers ?? {},
    body: overrides.body ?? {},
  } as VercelRequest
}

function mockSupabase(orgRow: { id: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: orgRow, error: null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('parseFacebookLeadBody', () => {
  it('accepts valid payload', () => {
    const result = parseFacebookLeadBody({
      org: 'fieldbourne',
      name: 'Jane Doe',
      phone: '0412 345 678',
      message: 'Need a TV aerial',
      email: 'jane@example.com',
    })
    expect(result).toEqual({
      ok: true,
      data: {
        org: 'fieldbourne',
        name: 'Jane Doe',
        phone: '0412 345 678',
        message: 'Need a TV aerial',
        email: 'jane@example.com',
        city: null,
        website: null,
        channel: 'messenger',
        form_name: null,
        ...unsetAgentFields,
      },
    })
  })

  it('defaults to the messenger channel when none is given', () => {
    const result = parseFacebookLeadBody({
      org: 'fieldbourne',
      name: 'Jane Doe',
      phone: '0412345678',
      message: 'Hi',
    })
    expect(result).toMatchObject({ ok: true, data: { channel: 'messenger' } })
  })

  it('accepts a Lead Ads payload and keeps the form name', () => {
    const result = parseFacebookLeadBody({
      org: 'fieldbourne',
      name: 'Jane Doe',
      phone: '0412345678',
      channel: 'lead_ads',
      form_name: 'TV Wall Mounting — Brisbane',
      city: 'Brisbane',
      message: '',
    })
    expect(result).toMatchObject({
      ok: true,
      data: {
        channel: 'lead_ads',
        form_name: 'TV Wall Mounting — Brisbane',
        message: 'Facebook Lead Ads enquiry — "TV Wall Mounting — Brisbane" — Brisbane',
      },
    })
  })

  it('rejects an unknown channel rather than silently defaulting', () => {
    const result = parseFacebookLeadBody({
      org: 'fieldbourne',
      name: 'Jane Doe',
      phone: '0412345678',
      channel: 'instagram',
    })
    expect(result).toMatchObject({
      ok: false,
      error: 'channel must be "messenger" or "lead_ads"',
      status: 400,
    })
  })

  it('accepts Facebook Lead Form payload with city and empty message', () => {
    const result = parseFacebookLeadBody({
      org: 'fieldbourne',
      name: 'Jane Doe',
      phone: '0412 345 678',
      city: 'Brisbane',
      message: '',
      website: '',
    })
    expect(result).toEqual({
      ok: true,
      data: {
        org: 'fieldbourne',
        name: 'Jane Doe',
        phone: '0412 345 678',
        message: 'Facebook lead form — Brisbane',
        city: 'Brisbane',
        email: null,
        website: null,
        channel: 'messenger',
        form_name: null,
        ...unsetAgentFields,
      },
    })
  })

  it('rejects honeypot website field', () => {
    const result = parseFacebookLeadBody({
      org: 'fieldbourne',
      name: 'Bot',
      phone: '0412345678',
      message: 'spam',
      website: 'https://spam.test',
    })
    expect(result).toEqual({ ok: false, error: 'Invalid submission', status: 400 })
  })

  it('requires org, name, and phone', () => {
    expect(parseFacebookLeadBody({ name: 'x', phone: '0', message: 'm' })).toMatchObject({
      ok: false,
      error: 'org is required',
    })
  })

  it('assembles a technician card only when the Gen-AI agent sends structured fields', () => {
    const result = parseFacebookLeadBody({
      org: 'default',
      name: 'Jane Citizen',
      phone: '0412345678',
      conversation_id: 'conv_abc123',
      suburb: 'Annerley',
      service_needed: 'Wall mount 75 inch plaster',
      out_of_area: false,
      message: 'Asked about price',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.conversation_id).toBe('conv_abc123')
    expect(result.data.suburb).toBe('Annerley')
    expect(result.data.message).toContain('Facebook Messenger — TV Magic South Brisbane')
    expect(result.data.message).toContain('Suburb: Annerley')
    expect(result.data.message).toContain('Service: Wall mount 75 inch plaster')
    expect(result.data.message).toContain('Out of area: no')
    expect(result.data.message).toContain('Notes: Asked about price')
  })
})

describe('buildFacebookLeadDetails', () => {
  it('uses city when message is empty', () => {
    expect(buildFacebookLeadDetails('', 'Gold Coast')).toBe('Facebook lead form — Gold Coast')
  })

  it('names the ad form for Lead Ads submissions with no free text', () => {
    expect(buildFacebookLeadDetails('', 'Gold Coast', 'lead_ads', 'Aerial Repairs')).toBe(
      'Facebook Lead Ads enquiry — "Aerial Repairs" — Gold Coast'
    )
  })

  it('falls back cleanly when a Lead Ads form has neither city nor form name', () => {
    expect(buildFacebookLeadDetails('', null, 'lead_ads', null)).toBe('Facebook Lead Ads enquiry')
  })

  it('always prefers the customer’s own words', () => {
    expect(buildFacebookLeadDetails('Aerial fell off the roof', 'Cairns', 'lead_ads', 'Form')).toBe(
      'Aerial fell off the roof'
    )
  })
})

describe('facebookLeadFallbackParse', () => {
  it('detects TV Aerial from message keywords', () => {
    const fields = facebookLeadFallbackParse('Pat', '0412345678', 'Need antenna install', null)
    expect(fields.service_type).toBe('TV Aerial')
    expect(fields.phone).toBe('+61412345678')
  })

  it('detects wall mounting and Starlink from newer keywords', () => {
    expect(inferFacebookServiceType('Can you wall mount a 75 inch?')).toBe('Wall Mounting')
    expect(inferFacebookServiceType('Need Starlink on the roof')).toBe('Starlink')
    expect(inferFacebookServiceType('TV is pixelating, no signal')).toBe('Reception Repair')
  })

  it('builds a readable card for technicians', () => {
    const card = assembleMessengerLeadDetails({
      name: 'Jane',
      phone: '0412345678',
      message: 'Asked about price',
      suburb: 'Annerley',
      serviceNeeded: 'Wall mount',
      outOfArea: false,
    })
    expect(card).toContain('Suburb: Annerley')
    expect(card).toContain('Out of area: no')
  })
})

describe('handleInboundFacebookLead', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, INBOUND_SECRET: 'test-inbound-secret' }
    vi.clearAllMocks()
    mockIsFeatureEnabled.mockResolvedValue(true)
    mockProcessInboundLead.mockResolvedValue({ leadId: 'lead-abc', savedLead: null })
    mockFindDuplicate.mockResolvedValue(null)
  })

  afterEach(() => {
    process.env = env
  })

  it('returns 401 when x-inbound-secret is wrong', async () => {
    const req = mockReq({ headers: { 'x-inbound-secret': 'wrong' } })
    const res = mockRes()
    await handleInboundFacebookLead(req, res, mockSupabase({ id: 'org-1' }))
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 when honeypot is filled', async () => {
    const req = mockReq({
      headers: { 'x-inbound-secret': 'test-inbound-secret' },
      body: {
        org: 'fieldbourne',
        name: 'Bot',
        phone: '0412345678',
        message: 'hi',
        website: 'filled',
      },
    })
    const res = mockRes()
    await handleInboundFacebookLead(req, res, mockSupabase({ id: 'org-1' }))
    expect(res.statusCode).toBe(400)
  })

  it('captures unrouted when org slug is unknown', async () => {
    const req = mockReq({
      headers: { 'x-inbound-secret': 'test-inbound-secret' },
      body: {
        org: 'missing-org',
        name: 'Jane',
        phone: '0412345678',
        message: 'Enquiry',
      },
    })
    const res = mockRes()
    const supabase = mockSupabase(null)
    await handleInboundFacebookLead(req, res, supabase)
    expect(mockCaptureUnrouted).toHaveBeenCalledWith(supabase, {
      channel: 'facebook_lead',
      identifier: 'missing-org',
      reason: 'no_mapping',
      payload: req.body,
    })
    expect(res.body).toEqual({ skipped: true, reason: 'unknown_org', org: 'missing-org' })
  })

  it('skips when inbound_messenger switch is off', async () => {
    mockIsFeatureEnabled.mockResolvedValue(false)
    const req = mockReq({
      headers: { 'x-inbound-secret': 'test-inbound-secret' },
      body: {
        org: 'fieldbourne',
        name: 'Jane',
        phone: '0412345678',
        message: 'Enquiry',
      },
    })
    const res = mockRes()
    await handleInboundFacebookLead(req, res, mockSupabase({ id: 'org-1' }))
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith('org-1', 'inbound_messenger')
    expect(mockProcessInboundLead).not.toHaveBeenCalled()
    expect(res.body).toEqual({ skipped: true, reason: 'inbound_messenger_disabled' })
  })

  it('gates Lead Ads on inbound_facebook_ads, not the Messenger switch', async () => {
    mockIsFeatureEnabled.mockResolvedValue(false)
    const req = mockReq({
      headers: { 'x-inbound-secret': 'test-inbound-secret' },
      body: {
        org: 'fieldbourne',
        name: 'Jane',
        phone: '0412345678',
        channel: 'lead_ads',
        form_name: 'Aerial Repairs',
      },
    })
    const res = mockRes()
    await handleInboundFacebookLead(req, res, mockSupabase({ id: 'org-1' }))
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith('org-1', 'inbound_facebook_ads')
    expect(mockProcessInboundLead).not.toHaveBeenCalled()
    expect(res.body).toEqual({ skipped: true, reason: 'inbound_facebook_ads_disabled' })
  })

  it('attributes Lead Ads leads to their own source so ad ROI stays measurable', async () => {
    const req = mockReq({
      headers: { 'x-inbound-secret': 'test-inbound-secret' },
      body: {
        org: 'fieldbourne',
        name: 'Jane Doe',
        phone: '0412 345 678',
        channel: 'lead_ads',
        form_name: 'Aerial Repairs',
        city: 'Brisbane',
      },
    })
    const res = mockRes()
    await handleInboundFacebookLead(req, res, mockSupabase({ id: 'org-1' }))

    const input = mockProcessInboundLead.mock.calls[0][0]
    expect(input.createdEvent.payload).toMatchObject({
      source: 'facebook_lead_ads',
      form_name: 'Aerial Repairs',
    })
    expect(input.run?.triggerChannel).toBe('facebook_lead_ads')
    expect(input.followUp?.source).toBe('facebook_lead_ads')
    expect(res.body).toEqual({ success: true, lead_id: 'lead-abc' })
  })

  it('creates lead when org resolves and switch is on', async () => {
    const req = mockReq({
      headers: { 'x-inbound-secret': 'test-inbound-secret' },
      body: {
        org: 'fieldbourne',
        name: 'Jane Doe',
        phone: '0412 345 678',
        message: 'TV aerial quote please',
        email: 'jane@example.com',
      },
    })
    const res = mockRes()
    await handleInboundFacebookLead(req, res, mockSupabase({ id: 'org-1' }))
    expect(mockProcessInboundLead).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, lead_id: 'lead-abc' })
  })

  it('returns an existing lead when the Gen-AI agent retries the same conversation', async () => {
    mockFindDuplicate.mockResolvedValue({ id: 'lead-existing' })
    const req = mockReq({
      headers: { 'x-inbound-secret': 'test-inbound-secret' },
      body: {
        org: 'default',
        name: 'Jane Doe',
        phone: '0412 345 678',
        conversation_id: 'conv_abc123',
        suburb: 'Annerley',
        service_needed: 'Wall mount',
      },
    })
    const res = mockRes()
    await handleInboundFacebookLead(req, res, mockSupabase({ id: 'org-1' }))
    expect(mockProcessInboundLead).not.toHaveBeenCalled()
    expect(res.body).toEqual({ success: true, lead_id: 'lead-existing', duplicate: true })
  })

  it('does not treat a structured-bot payload as a duplicate lookup hit', async () => {
    const req = mockReq({
      headers: { 'x-inbound-secret': 'test-inbound-secret' },
      body: {
        org: 'default',
        name: 'Jane Doe',
        phone: '0412 345 678',
        message: 'Need a TV aerial',
      },
    })
    const res = mockRes()
    await handleInboundFacebookLead(req, res, mockSupabase({ id: 'org-1' }))
    expect(mockFindDuplicate).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'facebook_messenger',
      null,
      '+61412345678'
    )
    expect(mockProcessInboundLead).toHaveBeenCalled()
    expect(res.body).toEqual({ success: true, lead_id: 'lead-abc' })
  })
})
