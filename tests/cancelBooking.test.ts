import { describe, it, expect } from 'vitest'
import { getColumnsForTab, LEAD_STATUS_LABELS, BOOKING_CANCELLED_STATUS } from '../src/lib/leadsKanban'
import { resolveBookingCustomerName, shouldCreateLeadFromBooking } from '../src/lib/calendarBooking'

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

describe('calendarBooking', () => {
  describe('resolveBookingCustomerName', () => {
    it('uses client name when provided', () => {
      expect(resolveBookingCustomerName('Jane Doe', 'TV Install')).toBe('Jane Doe')
    })

    it('falls back to title when client name empty', () => {
      expect(resolveBookingCustomerName('', 'TV Install — Jane')).toBe('TV Install — Jane')
    })
  })

  describe('shouldCreateLeadFromBooking', () => {
    it('does not create from title alone (team meetings)', () => {
      expect(shouldCreateLeadFromBooking(null, '', 'Team standup')).toBe(false)
    })

    it('creates when customer name is entered', () => {
      expect(shouldCreateLeadFromBooking(null, 'Jane Doe', 'TV Install')).toBe(true)
    })

    it('skips when lead already linked', () => {
      expect(shouldCreateLeadFromBooking('lead-1', '', 'TV Install')).toBe(false)
    })
  })
})
