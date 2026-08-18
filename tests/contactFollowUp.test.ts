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
  leadsDueForStaleAutoLost,
  leadsDueForFollowUpReminder,
  isFollowUpReminderCooldownElapsed,
  selectFollowUpReminderBatch,
  CONTACT_FOLLOW_UP_REMINDER_BATCH_SIZE,
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

  it('does not re-remind a lead whose reminder cooldown has not elapsed', () => {
    // Regression: the reminder path never advances the round or last_contact_attempted_at, so
    // before the cooldown existed a stale lead re-matched on every 15-min cron run forever
    // (29,825 notifications in prod over five weeks).
    const stale = new Date(Date.now() - CONTACT_FOLLOW_UP_MS - 5000).toISOString()
    const justReminded = new Date(Date.now() - 60_000).toISOString()
    const due = leadsDueForFollowUpReminder([
      {
        id: 'reminded-a-minute-ago',
        status: 'contact_attempted',
        contact_attempt_round: 1,
        last_contact_attempted_at: stale,
        last_follow_up_reminder_at: justReminded,
      },
    ])
    expect(due).toEqual([])
  })

  it('re-reminds once the cooldown has elapsed', () => {
    const stale = new Date(Date.now() - CONTACT_FOLLOW_UP_MS - 5000).toISOString()
    const remindedLongAgo = new Date(Date.now() - CONTACT_FOLLOW_UP_MS - 5000).toISOString()
    const due = leadsDueForFollowUpReminder([
      {
        id: 'cooldown-elapsed',
        status: 'contact_attempted',
        contact_attempt_round: 1,
        last_contact_attempted_at: stale,
        last_follow_up_reminder_at: remindedLongAgo,
      },
    ])
    expect(due.map((l) => l.id)).toEqual(['cooldown-elapsed'])
  })

  it('treats a never-reminded lead as due (no cooldown recorded yet)', () => {
    expect(isFollowUpReminderCooldownElapsed(null)).toBe(true)
    expect(isFollowUpReminderCooldownElapsed(undefined)).toBe(true)
  })

  it('writes off leads untouched for 14 days regardless of attempt round', () => {
    // A lead the employee never contacts never advances its round, so the round-based
    // auto-lost rule can never fire — prod had 72 such leads, oldest 40 days.
    const fifteenDays = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    const due = leadsDueForStaleAutoLost([
      { id: 'round-0-but-ancient', status: 'contact_attempted', contact_attempt_round: 0, last_contact_attempted_at: fifteenDays },
    ])
    expect(due.map((l) => l.id)).toEqual(['round-0-but-ancient'])
  })

  it('leaves leads inside the 14-day window alone', () => {
    const tenDays = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    expect(
      leadsDueForStaleAutoLost([
        { id: 'recent', status: 'contact_attempted', contact_attempt_round: 0, last_contact_attempted_at: tenDays },
      ])
    ).toEqual([])
  })

  it('never writes off a booked lead', () => {
    const ancient = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
    expect(
      leadsDueForStaleAutoLost([
        { id: 'booked', status: 'booked', contact_attempt_round: 1, last_contact_attempted_at: ancient },
      ])
    ).toEqual([])
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

  it('selects the oldest-due reminder batch and reports remaining', () => {
    expect(CONTACT_FOLLOW_UP_REMINDER_BATCH_SIZE).toBe(12)
    const nowMs = Date.parse('2026-07-01T12:00:00Z')
    const leads = Array.from({ length: 15 }, (_, i) => ({
      id: `lead-${String(i).padStart(2, '0')}`,
      status: 'contact_attempted',
      contact_attempt_round: 1,
      last_contact_attempted_at: new Date(nowMs - CONTACT_FOLLOW_UP_MS - (15 - i) * 60_000).toISOString(),
    }))
    const { batch, remaining } = selectFollowUpReminderBatch(leads, nowMs)
    expect(remaining).toBe(3)
    expect(batch).toHaveLength(12)
    expect(batch.map((lead) => lead.id)).toEqual([
      'lead-00', 'lead-01', 'lead-02', 'lead-03', 'lead-04', 'lead-05',
      'lead-06', 'lead-07', 'lead-08', 'lead-09', 'lead-10', 'lead-11',
    ])
  })
})


// Kanban ordering and attempt labels stay in the browser after the automatic sweep moved to the
// backend, so they are the presentation surface that must not drift.
describe('contactFollowUp presentation', () => {
  it('sorts assigned by soonest timer first, nulls last', () => {
    const sorted = sortLeadsForKanbanColumn(
      [
        { id: 'no-timer', status: 'assigned', timer_expires_at: null, created_at: '2026-01-01' },
        { id: 'later', status: 'assigned', timer_expires_at: '2026-01-02T12:00:00Z', created_at: '2026-01-02' },
        { id: 'soonest', status: 'assigned', timer_expires_at: '2026-01-02T09:00:00Z', created_at: '2026-01-03' },
      ],
      'assigned'
    )
    expect(sorted.map((lead) => lead.id)).toEqual(['soonest', 'later', 'no-timer'])
  })

  it('leaves unknown columns untouched', () => {
    const leads = [
      { id: 'b', status: 'booked', created_at: '2026-01-02' },
      { id: 'a', status: 'booked', created_at: '2026-01-01' },
    ]
    expect(sortLeadsForKanbanColumn(leads, 'booked').map((lead) => lead.id)).toEqual(['b', 'a'])
  })

  it('labels every attempt round the badge can render', () => {
    expect(getAttemptPhaseLabel(null)).toBeNull()
    expect(getAttemptPhaseLabel(undefined)).toBeNull()
    expect(getAttemptPhaseLabel(-1)).toBeNull()
    expect(getAttemptPhaseLabel(6)).toBeNull()
  })
})
