import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: vi.fn().mockReturnValue(null),
}))
vi.mock('../api/_lib/env.js', () => ({
  missingServerEnv: vi.fn().mockReturnValue([]),
}))
vi.mock('../api/_lib/sentry.js', () => ({
  captureServerException: vi.fn(),
  flushSentry: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../api/_lib/analytics.js', () => ({
  flushAnalytics: vi.fn().mockResolvedValue(undefined),
}))

import { captureServerException } from '../api/_lib/sentry'

const mockCapture = vi.mocked(captureServerException)

function createRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    headersSent: false,
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
  return res as unknown as VercelResponse & {
    statusCode: number
    headers: Record<string, string>
    body: unknown
  }
}

function createReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return { method: 'POST', headers: {}, query: {}, body: '', ...overrides } as VercelRequest
}

describe('inbound-sms — fails closed when server env is missing (AUD-8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('gives Twilio a TwiML ack instead of erroring', async () => {
    const { default: inboundSms } = await import('../api/inbound-sms')
    const res = createRes()
    await inboundSms(createReq(), res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('text/xml')
    expect(res.body).toBe('<Response></Response>')
    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('server not configured') }),
      expect.anything()
    )
  })

  it('503s the meta-webhook action instead of the Twilio ack', async () => {
    const { default: inboundSms } = await import('../api/inbound-sms')
    const res = createRes()
    await inboundSms(createReq({ query: { action: 'meta-webhook' } }), res)

    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'Server not configured' })
  })
})

describe('inbound-email — fails closed when server env is missing (AUD-8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('503s instead of throwing at module scope', async () => {
    const { default: inboundEmail } = await import('../api/inbound-email')
    const res = createRes()
    await inboundEmail(createReq(), res)

    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'Server not configured' })
    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('server not configured') }),
      expect.anything()
    )
  })
})
