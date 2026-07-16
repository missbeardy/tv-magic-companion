import { describe, expect, it } from 'vitest'
import {
  isBookingCancelled,
  isReminderDue,
  isWithinQuietHours,
} from '../api/_lib/bookingReminderPolicy'

function startInHours(hours: number, now = new Date()): Date {
  return new Date(now.getTime() + hours * 3_600_000)
}

describe('bookingReminderPolicy', () => {
  describe('isReminderDue', () => {
    it('does not fire for a booking 19 hours out', () => {
      const now = new Date()
      expect(isReminderDue(startInHours(19, now), now, null)).toBe(false)
    })

    it('fires exactly once for a booking 24 hours out', () => {
      const now = new Date()
      expect(isReminderDue(startInHours(24, now), now, null)).toBe(true)
    })

    it('does not re-fire on a second pass once reminder_sent_at is set', () => {
      const now = new Date()
      const start = startInHours(24, now)
      expect(isReminderDue(start, now, new Date())).toBe(false)
    })

    it('does not fire for a booking 29 hours out', () => {
      const now = new Date()
      expect(isReminderDue(startInHours(29, now), now, null)).toBe(false)
    })

    it('fires at the window boundaries (20h and 28h)', () => {
      const now = new Date()
      expect(isReminderDue(startInHours(20, now), now, null)).toBe(true)
      expect(isReminderDue(startInHours(28, now), now, null)).toBe(true)
    })
  })

  describe('isWithinQuietHours', () => {
    it('allows a mid-afternoon send in the booking org timezone', () => {
      const now = new Date('2026-07-16T05:00:00Z') // 13:00 AWST (UTC+8)
      expect(isWithinQuietHours(now, 'Australia/Perth')).toBe(true)
    })

    it('blocks a pre-8am send in the booking org timezone', () => {
      const now = new Date('2026-07-16T22:00:00Z') // 06:00 AWST next day
      expect(isWithinQuietHours(now, 'Australia/Perth')).toBe(false)
    })

    it('blocks a post-8pm send in the booking org timezone', () => {
      const now = new Date('2026-07-16T13:00:00Z') // 21:00 AWST
      expect(isWithinQuietHours(now, 'Australia/Perth')).toBe(false)
    })

    it('fails open on an invalid timezone rather than never sending', () => {
      const now = new Date()
      expect(isWithinQuietHours(now, 'Not/AZone')).toBe(true)
    })
  })

  describe('isBookingCancelled', () => {
    it('treats lost and booking_cancelled leads as cancelled', () => {
      expect(isBookingCancelled('lost')).toBe(true)
      expect(isBookingCancelled('booking_cancelled')).toBe(true)
    })

    it('treats booked, null, and other statuses as still going ahead', () => {
      expect(isBookingCancelled('booked')).toBe(false)
      expect(isBookingCancelled(null)).toBe(false)
      expect(isBookingCancelled(undefined)).toBe(false)
    })
  })
})
