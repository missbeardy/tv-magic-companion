import { createHmac } from 'crypto'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../api/_lib/messengerBot.js', () => ({
  handleMessengerUserMessage: vi.fn().mockResolvedValue({
    replies: ['ok'],
    submitted: false,
    leadId: null,
  }),
}))

vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: vi.fn().mockResolvedValue(true),
}))

vi.mock('../api/_lib/sentry.js', () => ({
  captureServerException: vi.fn(),
}))

import { handleMetaWebhook } from '../api/_lib/metaWebhook'
import { handleMessengerUserMessage } from '../api/_lib/messengerBot'
import { isFeatureEnabledForOrg } from '../api/_lib/featureSwitches'

const mockHandleTurn = vi.mocked(handleMessengerUserMessage)
const mockFeature = vi.mocked(isFeatureEnabledForOrg)

const secret = 'test-app-secret'

function sign(raw: string): string {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
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
    send(payload: unknown) {
      res.body = payload
      return res
    },
  }
  return res as unknown as VercelResponse & { statusCode: number; body: unknown }
}

function mockSupabase(orgId: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: orgId ? { org_id: orgId } : null, error: null }),
        }),
      }),
    }),
  }
}

describe('handleMetaWebhook', () => {
  const env = process.env

  beforeEach(() => {
    process.env = {
      ...env,
      META_APP_SECRET: secret,
      META_WEBHOOK_VERIFY_TOKEN: 'verify-me',
    }
    vi.clearAllMocks()
    mockFeature.mockResolvedValue(true)
  })

  afterEach(() => {
    process.env = env
  })

  it('returns the hub challenge on GET verify', async () => {
    const req = {
      method: 'GET',
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '12345' },
      headers: {},
    } as unknown as VercelRequest
    const res = mockRes()
    await handleMetaWebhook(req, res, mockSupabase('org-1') as never, '')
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('12345')
  })

  it('rejects a bad signature', async () => {
    const raw = '{"object":"page","entry":[]}'
    const req = {
      method: 'POST',
      query: {},
      headers: { 'x-hub-signature-256': sign('{}') },
    } as unknown as VercelRequest
    const res = mockRes()
    await handleMetaWebhook(req, res, mockSupabase('org-1') as never, raw)
    expect(res.statusCode).toBe(401)
  })

  it('skips echo events', async () => {
    const raw = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'user-1' },
              message: { text: 'hi', is_echo: true },
            },
          ],
        },
      ],
    })
    const req = {
      method: 'POST',
      query: {},
      headers: { 'x-hub-signature-256': sign(raw) },
    } as unknown as VercelRequest
    const res = mockRes()
    await handleMetaWebhook(req, res, mockSupabase('org-1') as never, raw)
    expect(res.statusCode).toBe(200)
    expect(mockHandleTurn).not.toHaveBeenCalled()
  })

  it('runs the receptionist on a customer text', async () => {
    const raw = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'user-1' },
              message: { text: 'Do you wall mount?' },
            },
          ],
        },
      ],
    })
    const req = {
      method: 'POST',
      query: {},
      headers: { 'x-hub-signature-256': sign(raw) },
    } as unknown as VercelRequest
    const res = mockRes()
    await handleMetaWebhook(req, res, mockSupabase('org-1') as never, raw)
    expect(res.statusCode).toBe(200)
    expect(mockHandleTurn).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'page-1',
      'user-1',
      'Do you wall mount?'
    )
  })
})
