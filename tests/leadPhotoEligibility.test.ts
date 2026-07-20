import { describe, expect, it } from 'vitest'
import { canAddLeadPhotos, PHOTO_ELIGIBLE_STATUSES } from '../src/lib/leadPhotoStorage'

describe('canAddLeadPhotos', () => {
  it('allows photos on active and completed statuses (before/mid/after job)', () => {
    expect(canAddLeadPhotos('assigned')).toBe(true)
    expect(canAddLeadPhotos('contact_attempted')).toBe(true)
    expect(canAddLeadPhotos('booked')).toBe(true)
    expect(canAddLeadPhotos('completed')).toBe(true)
  })

  it('blocks photos where no one is actively working the lead', () => {
    expect(canAddLeadPhotos('unassigned')).toBe(false)
    expect(canAddLeadPhotos('lost')).toBe(false)
    expect(canAddLeadPhotos('booking_cancelled')).toBe(false)
  })

  it('handles missing status safely', () => {
    expect(canAddLeadPhotos(null)).toBe(false)
    expect(canAddLeadPhotos(undefined)).toBe(false)
    expect(canAddLeadPhotos('')).toBe(false)
  })

  it('keeps completed in the eligible set (regression: photos still work post-job)', () => {
    expect(PHOTO_ELIGIBLE_STATUSES).toContain('completed')
  })
})
