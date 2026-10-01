import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  buildGameLeadDetails,
  normaliseAuMobile,
  parseGameLeadBody,
  serviceTypeForGameJob,
} from '../shared/gameLead'

vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))
vi.mock('../api/_lib/processInboundLead.js', () => ({ processInboundLead: vi.fn() }))
vi.mock('../api/_lib/inboundLeadDedup.js', () => ({ findRecentLeadByPhone: vi.fn() }))
vi.mock('../api/_lib/rateLimit.js', () => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimitIdentifier: vi.fn(() => '9.9.9.9'),
}))

import { handleGameLead } from '../api/_lib/handleGameLead'
import { processInboundLead } from '../api/_lib/processInboundLead'
import { findRecentLeadByPhone } from '../api/_lib/inboundLeadDedup'
import { checkRateLimit } from '../api/_lib/rateLimit'

const mockProcess = vi.mocked(processInboundLead)
const mockFindDup = vi.mocked(findRecentLeadByPhone)
const mockRateLimit = vi.mocked(checkRateLimit)

const validBody = {
  source: 'first-job-game',
  name: 'Sam Smith',
  mobile: '0412 345 678',
  suburb: 'Sunnybank',
  jobNeeded: 'Antenna installation',
  discountCode: 'FIRSTJOB10',
  consent: { agreed: true, text: 'I agree…', at: '2026-10-01T09:12:00+10:00' },
  feedback: [{ id: 'reception', question: 'How is your TV reception at home?', answer: 'Some glitches' }],
  meta: { puzzleSeconds: 21, wrongAttempts: 1, utm: { source: 'facebook' } },
  clientIp: '1.2.3.4',
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

function mockReq(body: unknown, secret: string | undefined = 'test-secret', method = 'POST'): VercelRequest {
  return {
    method,
    headers: secret ? { 'x-game-lead-secret': secret } : {},
    query: {},
    body,
  } as unknown as VercelRequest
}

function mockSupabase(orgId: string | null = 'org-1') {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: orgId ? { id: orgId } : null, error: null }),
  }
  return { from: vi.fn(() => chain) } as never
}

describe('normaliseAuMobile', () => {
  it('accepts spaced, +61 and 61 forms', () => {
    expect(normaliseAuMobile('0412 345 678')).toBe('0412345678')
    expect(normaliseAuMobile('+61412345678')).toBe('0412345678')
    expect(normaliseAuMobile('61 412 345 678')).toBe('0412345678')
    expect(normaliseAuMobile('412345678')).toBe('0412345678')
  })

  it('rejects landlines and short numbers', () => {
    expect(normaliseAuMobile('07 3123 4567')).toBeNull()
    expect(normaliseAuMobile('0412')).toBeNull()
  })
})

describe('parseGameLeadBody', () => {
  it('parses the spec payload and normalises the mobile', () => {
    const parsed = parseGameLeadBody(validBody)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.mobile).toBe('0412345678')
    expect(parsed.data.feedback).toHaveLength(1)
    expect(parsed.data.meta).toEqual({ puzzleSeconds: 21, wrongAttempts: 1, utm: { source: 'facebook' } })
  })

  it('flags the honeypot', () => {
    expect(parseGameLeadBody({ ...validBody, website: 'spam' })).toEqual({
      ok: false,
      error: 'Invalid submission',
      honeypot: true,
    })
  })

  it('requires consent and the right source', () => {
    expect(parseGameLeadBody({ ...validBody, consent: { agreed: false, text: 'x', at: validBody.consent.at } }).ok).toBe(false)
    expect(parseGameLeadBody({ ...validBody, source: 'other' }).ok).toBe(false)
  })

  it('drops malformed feedback and unknown utm keys', () => {
    const parsed = parseGameLeadBody({
      ...validBody,
      feedback: [{ id: 'x' }, 'junk', validBody.feedback[0]],
      meta: { puzzleSeconds: -4, utm: { source: 'fb', evil: 'x' } },
    })
    expect(parsed.ok && parsed.data.feedback).toHaveLength(1)
    expect(parsed.ok && parsed.data.meta).toEqual({ puzzleSeconds: null, wrongAttempts: null, utm: { source: 'fb' } })
  })
})

describe('serviceTypeForGameJob / buildGameLeadDetails', () => {
  it('maps every default job option', () => {
    expect(serviceTypeForGameJob('Antenna installation')).toBe('TV Aerial')
    expect(serviceTypeForGameJob('Reception repair or TV tuning')).toBe('Reception Repair')
    expect(serviceTypeForGameJob('Extra TV points')).toBe('TV Points')
    expect(serviceTypeForGameJob('TV wall mounting')).toBe('Wall Mounting')
    expect(serviceTypeForGameJob('Home theatre')).toBe('Home Theatre')
    expect(serviceTypeForGameJob('Other')).toBe('General Enquiry')
  })

  it('includes feedback, discount and puzzle stats', () => {
    const parsed = parseGameLeadBody(validBody)
    if (!parsed.ok) throw new Error('expected ok')
    const details = buildGameLeadDetails(parsed.data)
    expect(details).toContain('Discount code claimed: FIRSTJOB10')
    expect(details).toContain('How is your TV reception at home? Some glitches')
    expect(details).toContain('Cable puzzle: 21s, 1 wrong try')
    expect(details).toContain('UTM: source=facebook')
  })
})

describe('handleGameLead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GAME_LEAD_SECRET = 'test-secret'
    mockFindDup.mockResolvedValue(null)
    mockRateLimit.mockResolvedValue(true)
    mockProcess.mockResolvedValue({ leadId: 'lead-1', savedLead: null })
  })
  afterEach(() => {
    delete process.env.GAME_LEAD_SECRET
  })

  it('rejects a missing or wrong secret', async () => {
    const res = mockRes()
    await handleGameLead(mockReq(validBody, 'nope'), res, mockSupabase())
    expect(res.statusCode).toBe(401)
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('is off when GAME_LEAD_SECRET is unset', async () => {
    delete process.env.GAME_LEAD_SECRET
    const res = mockRes()
    await handleGameLead(mockReq(validBody), res, mockSupabase())
    expect(res.statusCode).toBe(401)
  })

  it('creates a first-job-game lead with the E.164 phone', async () => {
    const res = mockRes()
    await handleGameLead(mockReq(validBody), res, mockSupabase())
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, lead_id: 'lead-1' })
    expect(mockRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: 'game-lead', identifier: '1.2.3.4' }))
    const call = mockProcess.mock.calls[0][0]
    expect(call.orgId).toBe('org-1')
    expect(call.followUp?.resolvePhone({} as never)).toBe('+61412345678')
    expect(call.run?.triggerChannel).toBe('first-job-game')
  })

  it('returns the existing lead on a duplicate phone', async () => {
    mockFindDup.mockResolvedValue({ id: 'lead-old' } as never)
    const res = mockRes()
    await handleGameLead(mockReq(validBody), res, mockSupabase())
    expect(res.body).toEqual({ success: true, lead_id: 'lead-old', duplicate: true })
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('swallows honeypot submits with a 200', async () => {
    const res = mockRes()
    await handleGameLead(mockReq({ ...validBody, website: 'x' }), res, mockSupabase())
    expect(res.statusCode).toBe(200)
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('500s when the org slug does not resolve', async () => {
    const res = mockRes()
    await handleGameLead(mockReq(validBody), res, mockSupabase(null))
    expect(res.statusCode).toBe(500)
  })

  it('429s when rate limited', async () => {
    mockRateLimit.mockResolvedValue(false)
    const res = mockRes()
    await handleGameLead(mockReq(validBody), res, mockSupabase())
    expect(res.statusCode).toBe(429)
  })
})
