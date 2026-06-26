/** Server-safe lead event types for API — no src/lib imports. */

export type LeadEventType =
  | 'created'
  | 'duplicate_blocked'
  | 'missed_call_again'
  | 'assigned'
  | 'status_change'
  | 'contact_attempted'
  | 'call_attempted'
  | 'sms_attempted'
  | 'booked'
  | 'booking_cancelled'
  | 'completed'
  | 'lost'
  | 'expired'
  | 'unassigned'
  | 'review_request'
  | 'sms_sent'
