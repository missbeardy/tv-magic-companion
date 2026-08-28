import { describe, expect, it } from 'vitest'
import { readRawBody } from '../api/_lib/rawBody'
import type { VercelRequest } from '@vercel/node'

describe('readRawBody', () => {
  it('uses req.body when there is no stream (in-process invoke)', async () => {
    const raw = '{"object":"page"}'
    const buf = await readRawBody({ body: raw } as unknown as VercelRequest)
    expect(buf.toString()).toBe(raw)
  })
})
