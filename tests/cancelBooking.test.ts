import { describe, it, expect } from 'vitest'
import { getColumnsForTab, LEAD_STATUS_LABELS, BOOKING_CANCELLED_STATUS } from '../src/lib/leadsKanban'

describe('leadsKanban', () => {
  describe('LEAD_STATUS_LABELS', () => {
    it('includes booking_cancelled label', () => {
      expect(LEAD_STATUS_LABELS[BOOKING_CANCELLED_STATUS]).toBe('Booking Cancelled')
    })
  })

  describe('getColumnsForTab', () => {
    it('includes booking_cancelled in contact tab', () => {
      expect(getColumnsForTab('contact')).toContain(BOOKING_CANCELLED_STATUS)
    })

    it('keeps booked in contact tab', () => {
      expect(getColumnsForTab('contact')).toContain('booked')
    })

    it('does not include booking_cancelled in closed tab', () => {
      expect(getColumnsForTab('closed')).not.toContain(BOOKING_CANCELLED_STATUS)
    })
  })
})
