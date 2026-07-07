import { describe, expect, it } from 'vitest'
import {
  FOLLOW_UP_LADDER_HOURS,
  buildQuoteLink,
  firstName,
  formatJobService,
  hoursSinceSent,
  resolveFollowUpStage,
} from '../api/_lib/quoteChasePolicy'

function sentAtHoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000)
}

describe('quoteChasePolicy', () => {
  it('returns stage 1 at 48h after sent with follow_up_count 0', () => {
    const sent = sentAtHoursAgo(50)
    const now = new Date()
    expect(hoursSinceSent(sent, now)).toBeGreaterThanOrEqual(48)
    expect(resolveFollowUpStage(0, sent, null, now)).toBe(1)
  })

  it('returns null before 48h threshold', () => {
    const sent = sentAtHoursAgo(24)
    expect(resolveFollowUpStage(0, sent, new Date(), new Date())).toBeNull()
  })

  it('returns null on immediate re-run after stage 1 (count 1, under 5 days)', () => {
    const sent = sentAtHoursAgo(72)
    const now = new Date()
    expect(resolveFollowUpStage(1, sent, now, now)).toBeNull()
  })

  it('returns stage 2 at 5 days with follow_up_count 1', () => {
    const sent = sentAtHoursAgo(121)
    const now = new Date()
    const stage1Boundary = new Date(sent.getTime() + FOLLOW_UP_LADDER_HOURS[0] * 3_600_000)
    expect(resolveFollowUpStage(1, sent, stage1Boundary, now)).toBe(2)
  })

  it('blocks stage 2 when last_followed_up_at is on or after the 5-day boundary', () => {
    const sent = sentAtHoursAgo(121)
    const now = new Date()
    const boundary = new Date(sent.getTime() + FOLLOW_UP_LADDER_HOURS[1] * 3_600_000)
    expect(resolveFollowUpStage(1, sent, boundary, now)).toBeNull()
  })

  it('returns null when follow_up_count is at max', () => {
    const sent = sentAtHoursAgo(200)
    expect(resolveFollowUpStage(2, sent, null, new Date())).toBeNull()
  })

  it('extracts first name from customer name', () => {
    expect(firstName('Jane Smith')).toBe('Jane')
    expect(firstName('')).toBe('there')
  })

  it('formats job/service with fallback', () => {
    expect(formatJobService('TV wall mount')).toBe('TV wall mount')
    expect(formatJobService(null)).toBe('your job')
  })

  it('builds quote link from public token', () => {
    expect(buildQuoteLink('abc123')).toMatch(/\/quote\/abc123$/)
  })
})
