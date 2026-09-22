import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../api/_lib/sentry.js', () => ({
  captureServerException: vi.fn(),
  flushSentry: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../api/_lib/analytics.js', () => ({
  flushAnalytics: vi.fn().mockResolvedValue(undefined),
}))

import { captureServerException } from '../api/_lib/sentry'

const mockCapture = vi.mocked(captureServerException)

const ALL_PRESENT = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'x',
  TWILIO_AUTH_TOKEN: 'x',
  INBOUND_SECRET: 'x',
  CRON_SECRET: 'x',
  META_APP_SECRET: 'x',
  RESEND_API_KEY: 'x',
} as const

function stubAllPresent() {
  for (const [key, value] of Object.entries(ALL_PRESENT)) vi.stubEnv(key, value)
}

function createRes() {
  const res = {
    statusCode: 0,
    headersSent: false,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json() {
      return res
    },
  }
  return res as unknown as VercelResponse & { statusCode: number }
}

function createReq(): VercelRequest {
  return { method: 'GET', headers: {}, url: '/api/leads', query: {} } as unknown as VercelRequest
}

describe('withObservability — missing server env reported once per cold start (AUD-8)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports missing vars on the first request and not on the second', async () => {
    stubAllPresent()
    vi.stubEnv('RESEND_API_KEY', '')

    const { withObservability } = await import('../api/_lib/observability')
    const handler = vi.fn(async (_req: VercelRequest, res: VercelResponse) => {
      res.status(200).json({ ok: true })
    })
    const wrapped = withObservability(handler)

    await wrapped(createReq(), createRes())
    await wrapped(createReq(), createRes())

    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect(mockCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ missing: expect.stringContaining('RESEND_API_KEY') })
    )
  })

  it('does not report anything when every var is configured', async () => {
    stubAllPresent()

    const { withObservability } = await import('../api/_lib/observability')
    const handler = vi.fn(async (_req: VercelRequest, res: VercelResponse) => {
      res.status(200).json({ ok: true })
    })
    const wrapped = withObservability(handler)

    await wrapped(createReq(), createRes())

    expect(mockCapture).not.toHaveBeenCalled()
  })
})
