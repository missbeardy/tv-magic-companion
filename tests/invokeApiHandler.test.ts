import { describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { invokeApiHandler } from '../api/_lib/invokeApiHandler'

describe('invokeApiHandler', () => {
  it('captures json responses from handlers', async () => {
    const handler = vi.fn(async (_req: VercelRequest, res: VercelResponse) => {
      res.status(200).json({ lead_id: 'lead-123', ok: true })
    })

    const result = await invokeApiHandler(handler, {
      method: 'POST',
      url: '/api/inbound-email?secret=test',
      headers: { host: 'preview.example.com' },
      body: { plain: 'hello' },
      query: { secret: 'test' },
    })

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ lead_id: 'lead-123', ok: true })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('normalizes header keys to lowercase like real HTTP requests', async () => {
    const handler = vi.fn(async (req: VercelRequest, res: VercelResponse) => {
      res.status(200).json({ auth: req.headers.authorization ?? null })
    })

    const result = await invokeApiHandler(handler, {
      method: 'POST',
      url: '/api/inbound-email',
      headers: { Authorization: 'Basic abc123' },
      body: {},
      query: {},
    })

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ auth: 'Basic abc123' })
  })
})
