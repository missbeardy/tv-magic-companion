import { describe, expect, it } from 'vitest'
import {
  buildContactAttemptUpdate,
  buildFollowUpRolloverUpdate,
  getAttemptPhaseLabel,
  isFollowUpRolloverDue,
  leadsDueForFollowUpRollover,
  LOST_REASON_UNABLE_TO_CONTACT,
  MAX_CONTACT_ATTEMPTS,
  MAX_RETRY_WAIT_ROUND,
  rolloverEventType,
  sortLeadsForKanbanColumn,
} from '../src/lib/contactFollowUp'
import { CONTACT_FOLLOW_UP_MS } from '../src/lib/timer'

describe('contactFollowUp', () => {
  it('allows six contact attempts before lost', () => {
    expect(MAX_CONTACT_ATTEMPTS).toBe(6)
    expect(MAX_RETRY_WAIT_ROUND).toBe(5)
  })

  it('labels retry phases second through sixth', () => {
    expect(getAttemptPhaseLabel(1)).toBe('Second attempt')
    expect(getAttemptPhaseLabel(2)).toBe('Third attempt')
    expect(getAttemptPhaseLabel(3)).toBe('Fourth attempt')
    expect(getAttemptPhaseLabel(4)).toBe('Fifth attempt')
    expect(getAttemptPhaseLabel(5)).toBe('Sixth attempt')
    expect(getAttemptPhaseLabel(0)).toBeNull()
  })

  it('detects rollover due after 4 hours', () => {
    const old = new Date(Date.now() - CONTACT_FOLLOW_UP_MS - 1000).toISOString()
    expect(isFollowUpRolloverDue(old)).toBe(true)
    expect(isFollowUpRolloverDue(new Date().toISOString())).toBe(false)
  })

  it('rolls from first contact_attempted to second attempt assigned', () => {
    const update = buildFollowUpRolloverUpdate({ id: '1', status: 'contact_attempted', contact_attempt_round: 0 })
    expect(update.status).toBe('assigned')
    expect(update.contact_attempt_round).toBe(1)
    expect(update.timer_expires_at).toBeTruthy()
    expect(rolloverEventType(1)).toBe('second_attempt_started')
  })

  it('rolls through fifth attempt assigned', () => {
    const update = buildFollowUpRolloverUpdate({ id: '1', status: 'contact_attempted', contact_attempt_round: 4 })
    expect(update.contact_attempt_round).toBe(5)
    expect(rolloverEventType(5)).toBe('sixth_attempt_started')
  })

  it('sixth contact from assigned round 5 marks unable to contact lost', () => {
    const result = buildContactAttemptUpdate({
      id: '1',
      status: 'assigned',
      contact_attempt_round: MAX_RETRY_WAIT_ROUND,
    })
    expect(result.kind).toBe('unable_to_contact')
    expect(result.update.status).toBe('lost')
    expect(result.update.lost_reason).toBe(LOST_REASON_UNABLE_TO_CONTACT)
  })

  it('first contact moves to contact_attempted', () => {
    const result = buildContactAttemptUpdate({
      id: '1',
      status: 'assigned',
      contact_attempt_round: 0,
    })
    expect(result.kind).toBe('contact_attempted')
    expect(result.update.status).toBe('contact_attempted')
    expect(result.update.last_contact_attempted_at).toBeTruthy()
  })

  it('sorts contact_attempted oldest attempt first', () => {
    const sorted = sortLeadsForKanbanColumn(
      [
        {
          id: 'b',
          status: 'contact_attempted',
          last_contact_attempted_at: '2026-01-02T10:00:00Z',
          created_at: '2026-01-01',
        },
        {
          id: 'a',
          status: 'contact_attempted',
          last_contact_attempted_at: '2026-01-01T10:00:00Z',
          created_at: '2026-01-02',
        },
      ],
      'contact_attempted'
    )
    expect(sorted.map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('finds leads due for rollover but not at final wait round', () => {
    const due = leadsDueForFollowUpRollover([
      {
        id: '1',
        status: 'contact_attempted',
        contact_attempt_round: 0,
        last_contact_attempted_at: new Date(Date.now() - CONTACT_FOLLOW_UP_MS - 5000).toISOString(),
      },
      {
        id: '2',
        status: 'contact_attempted',
        contact_attempt_round: MAX_RETRY_WAIT_ROUND,
        last_contact_attempted_at: new Date(Date.now() - CONTACT_FOLLOW_UP_MS - 5000).toISOString(),
      },
    ])
    expect(due.map((l) => l.id)).toEqual(['1'])
  })
})
