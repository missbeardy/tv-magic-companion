import type { Json } from '../types/database.types'

export const LEAD_EVENT_TYPES = [
  'created',
  'duplicate_blocked',
  'missed_call_again',
  'assigned',
  'status_change',
  'contact_attempted',
  'contact_note',
  'call_attempted',
  'sms_attempted',
  'second_attempt_started',
  'third_attempt_started',
  'fourth_attempt_started',
  'fifth_attempt_started',
  'sixth_attempt_started',
  'booked',
  'booking_cancelled',
  'completed',
  'lost',
  'expired',
  'unassigned',
  'review_request',
  'sms_sent',
  'invoice_sent',
  'invoice_paid_manual',
  'deleted',
  'extraction_retried',
  'voicemail_enriched',
] as const

export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number]

export interface LeadEventInput {
  leadId: string
  orgId: string | null
  eventType: LeadEventType
  note?: string | null
  actorId?: string | null
  payload?: Record<string, unknown> | null
}

export function buildLeadEventInsert(input: LeadEventInput) {
  return {
    lead_id: input.leadId,
    org_id: input.orgId,
    event_type: input.eventType,
    note: input.note ?? null,
    payload: (input.payload ?? null) as Json,
    created_by: input.actorId ?? null,
  }
}
