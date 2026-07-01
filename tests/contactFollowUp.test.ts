import { describe, expect, it } from 'vitest'
import {
  buildContactAttemptUpdate,
  buildFollowUpEscalationUpdate,
  buildUnableToContactLostUpdate,
  escalationEventType,
  formatEscalationEventNote,
  getAttemptPhaseLabel,
  isFollowUpRolloverDue,
  leadsDueForFollowUpAutoLost,
  leadsDueForFollowUpReminder,
  LOST_REASON_UNABLE_TO_CONTACT,
  MAX_CONTACT_ATTEMPTS,
  FINAL_LABEL_ROUND,
  sortLeadsForKanbanColumn,
} from '../src/lib/contactFollowUp'
import { CONTACT_FOLLOW_UP_MS } from '../src/lib/timer'

describe('contactFollowUp', () => {
  it('allows six contact attempts before lost', () => {
    expect(MAX_CONTACT_ATTEMPTS).toBe(6)
    expect(FINAL_LABEL_ROUND).toBe(4)
  })

  it('labels retry phases 2nd through 5th Attempt', () => {
    expect(getAttemptPhaseLabel(1)).toBe('2nd Attempt')
    expect(getAttemptPhaseLabel(2)).toBe('3rd Attempt')
    expect(getAttemptPhaseLabel(3)).toBe('4th Attempt')
    expect(getAttemptPhaseLabel(4)).toBe('5th Attempt')
    expect(getAttemptPhaseLabel(0)).toBeNull()
    expect(getAttemptPhaseLabel(5)).toBeNull()
  })

  it('detects rollover due after 6 hours', () => {
    const old = new Date(Date.now() - CONTACT_FOLLOW_UP_MS - 1000).toISOString()
    expect(isFollowUpRolloverDue(old)).toBe(true)
    expect(isFollowUpRolloverDue(new Date().toISOString())).toBe(false)
  })

  it('buildFollowUpEscalationUpdate increments round (legacy helper)', () => {
    const update = buildFollowUpEscalationUpdate({ id: '1', status: 'contact_attempted', contact_attempt_round: 0 })
    expect(update.status).toBe('contact_attempted')
    expect(update.contact_attempt_round).toBe(1)
    expect(escalationEventType(1)).toBe('second_attempt_started')
  })

  it('auto-lost update sets unable_to_contact reason', () => {
    const update = buildUnableToContactLostUpdate()
    expect(update.status).toBe('lost')
    expect(update.lost_reason).toBe(LOST_REASON_UNABLE_TO_CONTACT)
  })

  it('first contact from assigned moves to contact_attempted round 0', () => {
    const result = buildContactAttemptUpdate({
      id: '1',
      status: 'assigned',
      contact_attempt_round: 0,
    })
    expect(result.kind).toBe('contact_attempted')
    expect(result.update.status).toBe('contact_attempted')
    expect(result.update.contact_attempt_round).toBe(0)
    expect(result.update.last_contact_attempted_at).toBeTruthy()
  })

  it('each retry while contact_attempted increments round', () => {
    const result = buildContactAttemptUpdate({
      id: '1',
      status: 'contact_attempted',
      contact_attempt_round: 2,
    })
    expect(result.kind).toBe('contact_attempted')
    expect(result.update.status).toBe('contact_attempted')
    expect(result.update.contact_attempt_round).toBe(3)
    expect(result.update.last_contact_attempted_at).toBeTruthy()
  })

  it('sixth contact action on 5th Attempt marks unable to contact lost', () => {
    const result = buildContactAttemptUpdate({
      id: '1',
      status: 'contact_attempted',
      contact_attempt_round: FINAL_LABEL_ROUND,
    })
    expect(result.kind).toBe('unable_to_contact')
    expect(result.update.status).toBe('lost')
    expect(result.update.lost_reason).toBe(LOST_REASON_UNABLE_TO_CONTACT)
  })

  it('sorts contact_attempted by highest round first, then oldest attempt', () => {
    const sorted = sortLeadsForKanbanColumn(
      [
        {
          id: 'low-round',
          status: 'contact_attempted',
          contact_attempt_round: 1,
          last_contact_attempted_at: '2026-01-01T10:00:00Z',
          created_at: '2026-01-01',
        },
        {
          id: 'high-round',
          status: 'contact_attempted',
          contact_attempt_round: 3,
          last_contact_attempted_at: '2026-01-02T10:00:00Z',
          created_at: '2026-01-02',
        },
      ],
      'contact_attempted'
    )
    expect(sorted.map((l) => l.id)).toEqual(['high-round', 'low-round'])
  })

  it('finds stale leads due for reminder but not final-round auto-lost', () => {
    const stale = new Date(Date.now() - CONTACT_FOLLOW_UP_MS - 5000).toISOString()
    const due = leadsDueForFollowUpReminder([
      {
        id: '1',
        status: 'contact_attempted',
        contact_attempt_round: 1,
        last_contact_attempted_at: stale,
      },
      {
        id: '2',
        status: 'contact_attempted',
        contact_attempt_round: FINAL_LABEL_ROUND,
        last_contact_attempted_at: stale,
      },
    ])
    expect(due.map((l) => l.id)).toEqual(['1'])
  })

  it('finds final-round leads due for auto-lost after 6h', () => {
    const stale = new Date(Date.now() - CONTACT_FOLLOW_UP_MS - 5000).toISOString()
    const due = leadsDueForFollowUpAutoLost([
      {
        id: '1',
        status: 'contact_attempted',
        contact_attempt_round: FINAL_LABEL_ROUND,
        last_contact_attempted_at: stale,
      },
    ])
    expect(due.map((l) => l.id)).toEqual(['1'])
  })

  it('formats escalation note with ordinal label', () => {
    expect(formatEscalationEventNote(1)).toBe('2nd Attempt — no contact in 6 hours')
  })
})
