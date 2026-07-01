/** Shared contact follow-up logic (client + API cron). */

export const CONTACT_FOLLOW_UP_MS = 6 * 60 * 60 * 1000 // 6 hours

/** Total employee contact actions before unable-to-contact lost. */
export const MAX_CONTACT_ATTEMPTS = 6

/** Last labelled round (5th Attempt). Next contact action → lost. */
export const FINAL_LABEL_ROUND = MAX_CONTACT_ATTEMPTS - 2

/** @deprecated Use FINAL_LABEL_ROUND */
export const MAX_RETRY_WAIT_ROUND = FINAL_LABEL_ROUND

export const LOST_REASON_UNABLE_TO_CONTACT = 'unable_to_contact' as const

export const CONTACT_FOLLOW_UP_HOURS = CONTACT_FOLLOW_UP_MS / (60 * 60 * 1000)

export interface ContactFollowUpLead {
  id: string
  status: string
  contact_attempt_round?: number | null
  last_contact_attempted_at?: string | null
  assigned_to?: string | null
}

const ATTEMPT_PHASE_LABELS: Record<number, string> = {
  1: '2nd Attempt',
  2: '3rd Attempt',
  3: '4th Attempt',
  4: '5th Attempt',
}

export function getAttemptPhaseLabel(round: number | null | undefined): string | null {
  if (round == null || round < 1) return null
  return ATTEMPT_PHASE_LABELS[round] ?? null
}

export function shouldMarkUnableToContact(lead: ContactFollowUpLead): boolean {
  return (
    lead.status === 'contact_attempted' &&
    (lead.contact_attempt_round ?? 0) >= FINAL_LABEL_ROUND
  )
}

export function isFollowUpRolloverDue(
  lastAttemptAt: string | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!lastAttemptAt) return false
  return nowMs - new Date(lastAttemptAt).getTime() >= CONTACT_FOLLOW_UP_MS
}

/** Stale leads eligible for a reminder (no round change — employee must contact again). */
export function leadsDueForFollowUpReminder(leads: ContactFollowUpLead[], nowMs = Date.now()): ContactFollowUpLead[] {
  return leads.filter(
    (lead) =>
      lead.status === 'contact_attempted' &&
      (lead.contact_attempt_round ?? 0) < FINAL_LABEL_ROUND &&
      isFollowUpRolloverDue(lead.last_contact_attempted_at, nowMs)
  )
}

/** @deprecated Timer no longer increments round */
export const leadsDueForFollowUpEscalation = leadsDueForFollowUpReminder

/** 5th Attempt showing (round 4) + 6h with no success → auto lost. */
export function leadsDueForFollowUpAutoLost(leads: ContactFollowUpLead[], nowMs = Date.now()): ContactFollowUpLead[] {
  return leads.filter(
    (lead) =>
      lead.status === 'contact_attempted' &&
      (lead.contact_attempt_round ?? 0) >= FINAL_LABEL_ROUND &&
      isFollowUpRolloverDue(lead.last_contact_attempted_at, nowMs)
  )
}

/** @deprecated Use leadsDueForFollowUpReminder */
export const leadsDueForFollowUpRollover = leadsDueForFollowUpReminder

/** @deprecated Rounds increment on employee contact, not timer */
export function buildFollowUpEscalationUpdate(
  lead: ContactFollowUpLead,
  nowIso = new Date().toISOString()
): Record<string, unknown> {
  const nextRound = (lead.contact_attempt_round ?? 0) + 1
  return {
    status: 'contact_attempted',
    contact_attempt_round: nextRound,
    last_contact_attempted_at: nowIso,
    timer_expires_at: null,
  }
}

export const buildFollowUpRolloverUpdate = buildFollowUpEscalationUpdate

export function buildUnableToContactLostUpdate(): Record<string, unknown> {
  return {
    status: 'lost',
    lost_reason: LOST_REASON_UNABLE_TO_CONTACT,
    timer_expires_at: null,
  }
}

export type RetryAttemptEventType =
  | 'second_attempt_started'
  | 'third_attempt_started'
  | 'fourth_attempt_started'
  | 'fifth_attempt_started'
  | 'sixth_attempt_started'

const RETRY_EVENT_BY_ROUND: Record<number, RetryAttemptEventType> = {
  1: 'second_attempt_started',
  2: 'third_attempt_started',
  3: 'fourth_attempt_started',
  4: 'fifth_attempt_started',
  5: 'sixth_attempt_started',
}

export function escalationEventType(round: number): RetryAttemptEventType {
  return RETRY_EVENT_BY_ROUND[round] ?? 'sixth_attempt_started'
}

export const rolloverEventType = escalationEventType

export type ContactAttemptResult =
  | { kind: 'unable_to_contact'; update: Record<string, unknown> }
  | { kind: 'contact_attempted'; update: Record<string, unknown> }

/**
 * Each employee contact action increments the attempt round (2nd → 5th Attempt).
 * Sixth action while on 5th Attempt → lost (unable to contact).
 */
export function buildContactAttemptUpdate(
  lead: ContactFollowUpLead,
  nowIso = new Date().toISOString()
): ContactAttemptResult {
  if (shouldMarkUnableToContact(lead)) {
    return {
      kind: 'unable_to_contact',
      update: buildUnableToContactLostUpdate(),
    }
  }

  if (lead.status === 'contact_attempted') {
    const nextRound = (lead.contact_attempt_round ?? 0) + 1
    return {
      kind: 'contact_attempted',
      update: {
        status: 'contact_attempted',
        contact_attempt_round: nextRound,
        last_contact_attempted_at: nowIso,
        timer_expires_at: null,
      },
    }
  }

  return {
    kind: 'contact_attempted',
    update: {
      status: 'contact_attempted',
      contact_attempt_round: 0,
      last_contact_attempted_at: nowIso,
      timer_expires_at: null,
    },
  }
}

export function formatEscalationEventNote(round: number): string {
  const label = getAttemptPhaseLabel(round) ?? 'Follow-up'
  return `${label} — no contact in ${CONTACT_FOLLOW_UP_HOURS} hours`
}

export function buildFollowUpNotificationCopy(
  leadName: string,
  serviceType: string | null | undefined,
  round: number
): { title: string; message: string } {
  const label = getAttemptPhaseLabel(round) ?? 'Follow-up'
  const service = serviceType?.trim() || 'General'
  return {
    title: `Lead needs ${label}`,
    message: `${leadName} (${service}) — no contact in ${CONTACT_FOLLOW_UP_HOURS} hours.`,
  }
}

export async function processContactFollowUpRollovers<T extends ContactFollowUpLead>(
  leads: T[],
  applyUpdate: (leadId: string, update: Record<string, unknown>) => Promise<boolean>,
  logEvent: (
    leadId: string,
    eventType: RetryAttemptEventType | 'lost',
    note: string,
    payload: Record<string, unknown>
  ) => Promise<void>,
  onReminder?: (lead: T) => Promise<void>,
  options?: { nowMs?: number }
): Promise<T[]> {
  const nowMs = options?.nowMs ?? Date.now()
  let result = leads

  for (const lead of leadsDueForFollowUpAutoLost(leads, nowMs)) {
    const update = buildUnableToContactLostUpdate()
    const ok = await applyUpdate(lead.id, update)
    if (!ok) continue

    await logEvent(lead.id, 'lost', 'Unable to contact', {
      from_status: 'contact_attempted',
      to_status: 'lost',
      reason: LOST_REASON_UNABLE_TO_CONTACT,
      contact_attempt_round: lead.contact_attempt_round,
      source: 'follow_up_timeout',
    })
    result = result.map((row) => (row.id === lead.id ? { ...row, ...update } : row)) as T[]
  }

  if (onReminder) {
    for (const lead of leadsDueForFollowUpReminder(result, nowMs)) {
      await onReminder(lead as T)
    }
  }

  return result
}

interface SortableLead extends ContactFollowUpLead {
  created_at?: string
  timer_expires_at?: string | null
}

export function sortLeadsForKanbanColumn<T extends SortableLead>(leads: T[], columnStatus: string): T[] {
  if (columnStatus === 'contact_attempted') {
    return [...leads].sort((a, b) => {
      const aRound = a.contact_attempt_round ?? 0
      const bRound = b.contact_attempt_round ?? 0
      if (aRound !== bRound) return bRound - aRound
      const aTs = a.last_contact_attempted_at ? new Date(a.last_contact_attempted_at).getTime() : 0
      const bTs = b.last_contact_attempted_at ? new Date(b.last_contact_attempted_at).getTime() : 0
      if (aTs !== bTs) return aTs - bTs
      return new Date(b.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
    })
  }

  if (columnStatus === 'assigned') {
    return [...leads].sort((a, b) => {
      const aTimer = a.timer_expires_at ? new Date(a.timer_expires_at).getTime() : Number.MAX_SAFE_INTEGER
      const bTimer = b.timer_expires_at ? new Date(b.timer_expires_at).getTime() : Number.MAX_SAFE_INTEGER
      if (aTimer !== bTimer) return aTimer - bTimer
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    })
  }

  return leads
}
