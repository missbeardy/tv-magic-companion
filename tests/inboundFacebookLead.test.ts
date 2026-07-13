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

import {
  parseFacebookLeadBody,
  buildFacebookLeadDetails,
  facebookLeadFallbackParse,
  handleInboundFacebookLead,
} from '../api/_lib/handleInboundFacebookLead'
import { isFeatureEnabledForOrg } from '../api/_lib/featureSwitches'
import { captureUnroutedInbound } from '../api/_lib/captureUnroutedInbound'
import { processInboundLead } from '../api/_lib/processInboundLead'

const mockIsFeatureEnabled = vi.mocked(isFeatureEnabledForOrg)
const mockCaptureUnrouted = vi.mocked(captureUnroutedInbound)
const mockProcessInboundLead = vi.mocked(processInboundLead)

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
  return res as VercelResponse & { statusCode: number; body: unknown }
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
      },
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
})

describe('buildFacebookLeadDetails', () => {
  it('uses city when message is empty', () => {
    expect(buildFacebookLeadDetails('', 'Gold Coast')).toBe('Facebook lead form — Gold Coast')
  })
})

describe('facebookLeadFallbackParse', () => {
  it('detects TV Aerial from message keywords', () => {
    const fields = facebookLeadFallbackParse('Pat', '0412345678', 'Need antenna install', null)
    expect(fields.service_type).toBe('TV Aerial')
    expect(fields.phone).toBe('+61412345678')
  })
})

describe('handleInboundFacebookLead', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, INBOUND_SECRET: 'test-inbound-secret' }
    vi.clearAllMocks()
    mockIsFeatureEnabled.mockResolvedValue(true)
    mockProcessInboundLead.mockResolvedValue({ leadId: 'lead-abc', savedLead: null })
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
    expect(mockProcessInboundLead).not.toHaveBeenCalled()
    expect(res.body).toEqual({ skipped: true, reason: 'inbound_messenger_disabled' })
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
})
