import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  buildCampaignLeadDetails,
  parseCampaignQuoteBody,
  serviceTypeForProductKind,
} from '../shared/campaignQuote'

vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: vi.fn(),
}))

vi.mock('../api/_lib/captureUnroutedInbound.js', () => ({
  captureUnroutedInbound: vi.fn(),
}))

vi.mock('../api/_lib/processInboundLead.js', () => ({
  processInboundLead: vi.fn(),
}))

vi.mock('../api/_lib/inboundLeadDedup.js', () => ({
  findRecentLeadByPhone: vi.fn(),
}))

vi.mock('../api/_lib/rateLimit.js', () => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimitIdentifier: vi.fn(() => '1.1.1.1'),
}))

import { handleCampaignQuote } from '../api/_lib/handleCampaignQuote'
import { processInboundLead } from '../api/_lib/processInboundLead'
import { findRecentLeadByPhone } from '../api/_lib/inboundLeadDedup'
import { checkRateLimit } from '../api/_lib/rateLimit'

const mockProcess = vi.mocked(processInboundLead)
const mockFindDup = vi.mocked(findRecentLeadByPhone)
const mockRateLimit = vi.mocked(checkRateLimit)

const validBody = {
  name: 'Alex Test',
  phone: '0400000000',
  address: '12 Example St Brisbane',
  productId: 'tv-65',
  productLabel: '65" TV',
  productKind: 'tv',
  centreHeightMm: 1100,
  ceilingHeightMm: 2400,
  wallWidthMm: 4200,
  viewingDistanceMm: 3200,
  floorToBottom: 696,
  ceilingToTop: 896,
  zone: 'in',
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

function mockReq(body: unknown, method = 'POST'): VercelRequest {
  return {
    method,
    headers: { 'x-forwarded-for': '1.1.1.1' },
    body,
  } as unknown as VercelRequest
}

function mockSupabase(orgRow: { id: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: orgRow, error: null })
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
  }
}

describe('parseCampaignQuoteBody', () => {
  it('accepts a complete visualiser quote', () => {
    const parsed = parseCampaignQuoteBody(validBody)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.data.productId).toBe('tv-65')
  })

  it('silently flags the honeypot', () => {
    const parsed = parseCampaignQuoteBody({ ...validBody, website: 'https://spam.test' })
    expect(parsed).toMatchObject({ ok: false, honeypot: true })
  })

  it('rejects a missing address', () => {
    const parsed = parseCampaignQuoteBody({ ...validBody, address: '' })
    expect(parsed).toEqual({ ok: false, error: 'address is required' })
  })
})

describe('campaign quote mapping', () => {
  it('maps catalog kinds onto service types techs already use', () => {
    expect(serviceTypeForProductKind('tv')).toBe('Wall Mounting')
    expect(serviceTypeForProductKind('soundbar')).toBe('Sound Bar')
    expect(serviceTypeForProductKind('video-wall')).toBe('Video Wall')
  })

  it('puts millimetres in the lead details', () => {
    const details = buildCampaignLeadDetails({ ...validBody, productKind: 'tv', zone: 'in' })
    expect(details).toContain('65" TV')
    expect(details).toContain('1,100 mm')
    expect(details).toContain('On the ideal spot')
  })
})

describe('handleCampaignQuote', () => {
  beforeEach(() => {
    mockProcess.mockReset()
    mockFindDup.mockReset()
    mockRateLimit.mockReset()
    mockRateLimit.mockResolvedValue(true)
    mockFindDup.mockResolvedValue(null)
    mockProcess.mockResolvedValue({ leadId: 'lead-1', savedLead: null })
  })

  it('creates a lead through the inbound pipeline', async () => {
    const res = mockRes()
    await handleCampaignQuote(mockReq(validBody), res, mockSupabase({ id: 'org-1' }) as never)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, lead_id: 'lead-1' })
    expect(mockProcess).toHaveBeenCalledOnce()
  })

  it('returns the existing lead on a same-day duplicate phone', async () => {
    mockFindDup.mockResolvedValue({ id: 'existing', name: 'Alex', extraction_status: 'skipped' })
    const res = mockRes()
    await handleCampaignQuote(mockReq(validBody), res, mockSupabase({ id: 'org-1' }) as never)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, lead_id: 'existing', duplicate: true })
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('rate-limits public spam', async () => {
    mockRateLimit.mockResolvedValue(false)
    const res = mockRes()
    await handleCampaignQuote(mockReq(validBody), res, mockSupabase({ id: 'org-1' }) as never)
    expect(res.statusCode).toBe(429)
  })

  it('treats honeypot posts as a fake success', async () => {
    const res = mockRes()
    await handleCampaignQuote(
      mockReq({ ...validBody, website: 'http://bot' }),
      res,
      mockSupabase({ id: 'org-1' }) as never
    )
    expect(res.statusCode).toBe(200)
    expect(mockProcess).not.toHaveBeenCalled()
  })
})
