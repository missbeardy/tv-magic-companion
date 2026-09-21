import { describe, expect, it } from 'vitest'
import {
  chunkIds,
  CLOSED_LOOKBACK_DAYS,
  LEAD_ID_IN_CHUNK,
  LEADS_BOARD_LIMIT,
  leadsBoardOrFilter,
} from '../src/lib/leadsBoardQuery'

describe('leadsBoardOrFilter', () => {
  it('keeps active statuses and recently closed jobs', () => {
    const now = new Date('2026-09-16T00:00:00.000Z')
    const filter = leadsBoardOrFilter(now)
    expect(filter).toContain('status.not.in.(completed,lost,booking_cancelled)')
    expect(filter).toContain('updated_at.gte."2026-08-17T00:00:00.000Z"')
    expect(CLOSED_LOOKBACK_DAYS).toBe(30)
    expect(LEADS_BOARD_LIMIT).toBe(500)
  })
})

describe('chunkIds', () => {
  it('splits long lead id lists so PostgREST URLs stay short', () => {
    const ids = Array.from({ length: 170 }, (_, i) => `id-${i}`)
    const chunks = chunkIds(ids)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(LEAD_ID_IN_CHUNK)
    expect(chunks[2]).toHaveLength(10)
  })
})
