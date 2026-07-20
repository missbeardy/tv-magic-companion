import { describe, expect, it } from 'vitest'
import { shouldAutoReviewOnPaid } from '../api/_lib/reviewRequest'

describe('shouldAutoReviewOnPaid', () => {
  const base = {
    autoReviewEnabled: true,
    reviewRequestsEnabled: true,
    googleReviewUrl: 'https://g.page/r/example/review',
    reviewRequestSentAt: null as string | null,
    phone: '0412345678',
  }

  it('allows send when all guards pass', () => {
    expect(shouldAutoReviewOnPaid(base)).toEqual({ ok: true })
  })

  it('blocks when auto_review_on_paid is off', () => {
    expect(shouldAutoReviewOnPaid({ ...base, autoReviewEnabled: false })).toEqual({
      ok: false,
      reason: 'auto_review_on_paid_disabled',
    })
  })

  it('blocks when review_requests is off', () => {
    expect(shouldAutoReviewOnPaid({ ...base, reviewRequestsEnabled: false })).toEqual({
      ok: false,
      reason: 'review_requests_disabled',
    })
  })

  it('blocks when Google review URL is missing', () => {
    expect(shouldAutoReviewOnPaid({ ...base, googleReviewUrl: '  ' })).toEqual({
      ok: false,
      reason: 'google_review_url_missing',
    })
  })

  it('blocks when a review was already sent', () => {
    expect(
      shouldAutoReviewOnPaid({ ...base, reviewRequestSentAt: '2026-07-20T00:00:00Z' })
    ).toEqual({ ok: false, reason: 'already_sent' })
  })

  it('blocks when lead has no phone', () => {
    expect(shouldAutoReviewOnPaid({ ...base, phone: null })).toEqual({
      ok: false,
      reason: 'no_phone',
    })
  })
})
