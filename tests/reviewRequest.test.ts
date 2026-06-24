import { describe, it, expect } from 'vitest'
import { canOfferReviewRequest, getReviewRequestBlockReason } from '../src/lib/reviewRequest'

describe('canOfferReviewRequest', () => {
  const org = {
    name: 'TV Magic',
    google_review_url: 'https://g.page/r/example/review',
    review_requests_enabled: true,
  }

  const lead = {
    id: 'lead-1',
    name: 'Jane',
    phone: '0412345678',
    review_request_sent_at: null,
  }

  it('returns true when org is configured and lead has phone', () => {
    expect(canOfferReviewRequest(org, lead)).toBe(true)
  })

  it('returns false when toggle is off', () => {
    expect(canOfferReviewRequest({ ...org, review_requests_enabled: false }, lead)).toBe(false)
  })

  it('returns false when google review URL is missing', () => {
    expect(canOfferReviewRequest({ ...org, google_review_url: '' }, lead)).toBe(false)
  })

  it('returns false when lead has no phone', () => {
    expect(canOfferReviewRequest(org, { ...lead, phone: '' })).toBe(false)
    expect(getReviewRequestBlockReason(org, { ...lead, phone: '' })).toContain('no phone')
  })

  it('returns false when review was already sent', () => {
    expect(
      canOfferReviewRequest(org, { ...lead, review_request_sent_at: '2026-06-24T00:00:00Z' })
    ).toBe(false)
  })
})
