import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { computeMobileMessageSignature } from '../api/_lib/mobileMessage'

/**
 * api/inbound-sms.ts?provider=mm (T1.18). Everything with I/O is mocked: Supabase, Sentry,
 * PostHog, the lead pipeline and waitUntil. .env.local can leak prod credentials into vitest
 * workers, so nothing here may reach a real network or database.
 */

const pending: Promise<unknown>[] = []
const dedupeCounts = new Map<string, number>()
const fakeSupabase = {
  rpc: vi.fn(async (_fn: string, args: { p_key: string; p_window_start: string }) => {
    const key = `${args.p_key}@${args.p_window_start}`
    const next = (dedupeCounts.get(key) ?? 0) + 1
    dedupeCounts.set(key, next)
    return { data: next, error: null }
  }),
  from: vi.fn(() => {
    throw new Error('unexpected direct table access in this test')
  }),
}

vi.mock('@vercel/functions', () => ({
  waitUntil: (promise: Promise<unknown>) => {
    pending.push(promise)
  },
}))
vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => fakeSupabase,
}))
vi.mock('../api/_lib/sentry.js', () => ({
  captureServerException: vi.fn(),
  flushSentry: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../api/_lib/analytics.js', () => ({
  flushAnalytics: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../api/_lib/rateLimit.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  rateLimitIdentifier: () => 'test-ip',
}))
vi.mock('../api/_lib/resolveOrgFromDid.js', () => ({
  resolveOrgIdFromDid: vi.fn(),
}))
vi.mock('../api/_lib/captureUnroutedInbound.js', () => ({
  captureUnroutedInbound: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../api/_lib/smsOptOut.js', () => ({
  applyInboundSmsOptOut: vi.fn().mockResolvedValue('ignored'),
  recordSmsOptOut: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: vi.fn().mockResolvedValue(true),
}))
vi.mock('../api/_lib/threadInboundSms.js', () => ({
  threadInboundSms: vi.fn().mockResolvedValue(null),
}))
vi.mock('../api/_lib/processInboundLead.js', () => ({
  processInboundLead: vi.fn().mockResolvedValue({ leadId: 'lead-1' }),
}))
vi.mock('../api/_lib/rawFirstLead.js', () => ({
  insertRawFirstLead: vi.fn(),
}))
vi.mock('../api/_lib/extractLead.js', () => ({
  extractFromSms: vi.fn(),
  loadOrgExtractionContext: vi.fn(),
}))
vi.mock('../api/_lib/inboundProbe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/_lib/inboundProbe')>()
  return { ...actual, recordInboundProbeEcho: vi.fn().mockResolvedValue(undefined) }
})

import inboundSms from '../api/inbound-sms'
import { resolveOrgIdFromDid } from '../api/_lib/resolveOrgFromDid'
import { captureUnroutedInbound } from '../api/_lib/captureUnroutedInbound'
import { applyInboundSmsOptOut, recordSmsOptOut } from '../api/_lib/smsOptOut'
import { processInboundLead } from '../api/_lib/processInboundLead'
import { recordInboundProbeEcho } from '../api/_lib/inboundProbe'

const SECRET = 'test-mm-secret'
const OUR_NUMBER = '61400111222'
const CUSTOMER = '61412345678'

function createRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
    send(payload: unknown) {
      res.body = payload
      return res
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value
    },
  }
  return res as unknown as VercelResponse & { statusCode: number; body: unknown; headers: Record<string, string> }
}

function signedReq(
  payload: Record<string, unknown>,
  options: {
    secret?: string
    timestamp?: number
    tamper?: boolean
    query?: Record<string, string>
    headers?: Record<string, string>
  } = {}
): VercelRequest {
  const rawBody = JSON.stringify(payload)
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000))
  let signature = computeMobileMessageSignature(options.secret ?? SECRET, timestamp, rawBody)
  if (options.tamper) signature = signature.replace(/.$/, (c) => (c === '0' ? '1' : '0'))
  return {
    method: 'POST',
    url: '/api/inbound-sms?provider=mm',
    query: { provider: 'mm', ...options.query },
    headers: {
      host: 'tv-magic-companion.vercel.app',
      'content-type': 'application/json',
      'x-mm-timestamp': timestamp,
      'x-mm-signature': signature,
      ...options.headers,
    },
    body: rawBody,
  } as unknown as VercelRequest
}

function inbound(overrides: Record<string, unknown> = {}) {
  return {
    to: OUR_NUMBER,
    message: 'Hi, can you mount a 75 inch TV in Parramatta? 🙂',
    sender: CUSTOMER,
    received_at: '2026-09-23 01:02:03',
    type: 'inbound',
    original_message_id: '',
    original_custom_ref: '',
    ...overrides,
  }
}

async function run(req: VercelRequest) {
  const res = createRes()
  await inboundSms(req, res)
  await Promise.all(pending.splice(0))
  return res
}

describe('inbound-sms ?provider=mm', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, MOBILE_MESSAGE_WEBHOOK_SECRET: SECRET }
    vi.clearAllMocks()
    pending.length = 0
    dedupeCounts.clear()
    vi.mocked(resolveOrgIdFromDid).mockResolvedValue({ orgId: 'org-fbd', source: 'phone_mapping' })
  })

  it('acks 200 fast and maps to/sender/message onto the shared pipeline', async () => {
    const res = createRes()
    await inboundSms(signedReq(inbound()), res)

    // Acked before the pipeline ran: the work is still sitting in waitUntil.
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(pending).toHaveLength(1)
    expect(processInboundLead).not.toHaveBeenCalled()

    await Promise.all(pending.splice(0))

    expect(resolveOrgIdFromDid).toHaveBeenCalledWith(fakeSupabase, '+61400111222')
    expect(applyInboundSmsOptOut).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-fbd', fromNumber: '+61412345678' })
    )
    expect(processInboundLead).toHaveBeenCalledTimes(1)
    const args = vi.mocked(processInboundLead).mock.calls[0][0]
    expect(args.orgId).toBe('org-fbd')
    expect(args.createdEvent.payload).toEqual({ source: 'sms', from: '+61412345678' })
    expect(args.run?.triggerSummary).toEqual({ identifier: '+61400111222', source: 'sms' })
  })

  it('creates one lead when Mobile Message retries the same event', async () => {
    await run(signedReq(inbound()))
    // The retry arrives with a fresh timestamp + signature, same payload.
    await run(signedReq(inbound(), { timestamp: Math.floor(Date.now() / 1000) + 5 }))

    expect(processInboundLead).toHaveBeenCalledTimes(1)
  })

  it('a different message from the same sender is not a duplicate', async () => {
    await run(signedReq(inbound()))
    await run(signedReq(inbound({ message: 'Also a soundbar', received_at: '2026-09-23 01:05:00' })))
    expect(processInboundLead).toHaveBeenCalledTimes(2)
  })

  it('writes an unsubscribe to our own opt-out table and creates no lead', async () => {
    const res = await run(signedReq(inbound({ type: 'unsubscribe', message: 'STOP' })))

    expect(res.statusCode).toBe(200)
    expect(recordSmsOptOut).toHaveBeenCalledWith({
      supabase: fakeSupabase,
      orgId: 'org-fbd',
      fromNumber: '+61412345678',
      source: 'mobilemessage_unsubscribe',
      note: 'Customer opted out (Mobile Message)',
    })
    expect(processInboundLead).not.toHaveBeenCalled()
  })

  it('captures an unsubscribe for an unmapped number instead of guessing an org', async () => {
    vi.mocked(resolveOrgIdFromDid).mockResolvedValue({ orgId: null, source: 'unresolved' })
    await run(signedReq(inbound({ type: 'unsubscribe', message: 'STOP' })))
    expect(recordSmsOptOut).not.toHaveBeenCalled()
    expect(captureUnroutedInbound).toHaveBeenCalled()
  })

  it('routes an unmapped inbound number to unrouted capture', async () => {
    vi.mocked(resolveOrgIdFromDid).mockResolvedValue({ orgId: null, source: 'unresolved' })
    await run(signedReq(inbound()))
    expect(captureUnroutedInbound).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({ channel: 'sms', identifier: '+61400111222', reason: 'no_mapping' })
    )
    expect(processInboundLead).not.toHaveBeenCalled()
  })

  it('rejects a forged signature with 401 and does no work', async () => {
    const res = await run(signedReq(inbound(), { tamper: true }))
    expect(res.statusCode).toBe(401)
    expect(resolveOrgIdFromDid).not.toHaveBeenCalled()
    expect(processInboundLead).not.toHaveBeenCalled()
  })

  it('rejects a body signed with a different secret', async () => {
    const res = await run(signedReq(inbound(), { secret: 'someone-else' }))
    expect(res.statusCode).toBe(401)
    expect(processInboundLead).not.toHaveBeenCalled()
  })

  it('rejects a stale (replayed) timestamp with 400', async () => {
    const res = await run(signedReq(inbound(), { timestamp: Math.floor(Date.now() / 1000) - 600 }))
    expect(res.statusCode).toBe(400)
    expect(processInboundLead).not.toHaveBeenCalled()
  })

  it('rejects everything with 503 while the signing secret is unset', async () => {
    delete process.env.MOBILE_MESSAGE_WEBHOOK_SECRET
    const res = await run(signedReq(inbound()))
    expect(res.statusCode).toBe(503)
    expect(processInboundLead).not.toHaveBeenCalled()
  })

  it('verifies and 200s a delivery-status webhook without running the lead pipeline', async () => {
    const res = await run(
      signedReq(
        {
          to: CUSTOMER,
          message: 'On our way',
          sender: OUR_NUMBER,
          received_at: '2026-09-23 01:02:03',
          status: 'delivered',
          message_id: 'uuid-1',
          part_number: 1,
          total_parts: 1,
        },
        { query: { kind: 'status' } }
      )
    )
    expect(res.statusCode).toBe(200)
    expect(pending).toHaveLength(0)
    expect(processInboundLead).not.toHaveBeenCalled()
  })

  it('still rejects an unsigned status webhook', async () => {
    const res = await run(
      signedReq({ status: 'delivered', message_id: 'uuid-1' }, { query: { kind: 'status' }, tamper: true })
    )
    expect(res.statusCode).toBe(401)
  })

  it('echoes the synthetic probe without creating a lead', async () => {
    await run(signedReq(inbound({ message: '[INBOUND-PROBE] nonce-mm' })))
    expect(recordInboundProbeEcho).toHaveBeenCalledWith(fakeSupabase, 'nonce-mm')
    expect(processInboundLead).not.toHaveBeenCalled()
  })

  it('awaits the pipeline for the in-process simulator (x-inbound-await)', async () => {
    const res = createRes()
    await inboundSms(signedReq(inbound(), { headers: { 'x-inbound-await': '1' } }), res)
    expect(pending).toHaveLength(0)
    expect(processInboundLead).toHaveBeenCalledTimes(1)
  })
})

describe('inbound-sms Twilio path is unchanged', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pending.length = 0
    process.env.TWILIO_AUTH_TOKEN = 'twilio-token'
  })

  it('still answers TwiML and drops an unsigned Twilio post', async () => {
    const res = createRes()
    await inboundSms(
      {
        method: 'POST',
        url: '/api/inbound-sms',
        query: {},
        headers: { host: 'tv-magic-companion.vercel.app' },
        body: 'Body=hello&From=%2B61412345678&To=%2B61468050366',
      } as unknown as VercelRequest,
      res
    )
    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('text/xml')
    expect(res.body).toBe('<Response></Response>')
    expect(processInboundLead).not.toHaveBeenCalled()
  })

  it('does not accept a Mobile Message signature on the Twilio URL', async () => {
    process.env.MOBILE_MESSAGE_WEBHOOK_SECRET = SECRET
    const req = signedReq(inbound())
    ;(req as { query: Record<string, string> }).query = {}
    const res = createRes()
    await inboundSms(req, res)
    await Promise.all(pending.splice(0))
    expect(res.headers['Content-Type']).toBe('text/xml')
    expect(processInboundLead).not.toHaveBeenCalled()
  })
})
