import { getExpiresAt, CONTACT_FOLLOW_UP_MS } from './timer'

/** Waiting phases: 1 = second attempt, 2 = third attempt; lost on contact at round 2. */
export const MAX_RETRY_WAIT_ROUND = 2

export const LOST_REASON_UNABLE_TO_CONTACT = 'unable_to_contact' as const

export interface ContactFollowUpLead {
  id: string
  status: string
  contact_attempt_round?: number | null
  last_contact_attempted_at?: string | null
  assigned_to?: string | null
}

export function getAttemptPhaseLabel(round: number | null | undefined): string | null {
  if (round === 1) return 'Second attempt'
  if (round === 2) return 'Third attempt'
  return null
}

export function isFollowUpRolloverDue(lastAttemptAt: string | null | undefined): boolean {
  if (!lastAttemptAt) return false
  return Date.now() - new Date(lastAttemptAt).getTime() >= CONTACT_FOLLOW_UP_MS
}

export function leadsDueForFollowUpRollover(leads: ContactFollowUpLead[]): ContactFollowUpLead[] {
  return leads.filter(
    (lead) =>
      lead.status === 'contact_attempted' &&
      (lead.contact_attempt_round ?? 0) < MAX_RETRY_WAIT_ROUND &&
      isFollowUpRolloverDue(lead.last_contact_attempted_at)
  )
}

export function buildFollowUpRolloverUpdate(lead: ContactFollowUpLead): Record<string, unknown> {
  const nextRound = (lead.contact_attempt_round ?? 0) + 1
  return {
    status: 'assigned',
    contact_attempt_round: nextRound,
    timer_expires_at: getExpiresAt(),
  }
}

export function rolloverEventType(nextRound: number): 'second_attempt_started' | 'third_attempt_started' {
  return nextRound === 1 ? 'second_attempt_started' : 'third_attempt_started'
}

export function shouldMarkUnableToContact(lead: ContactFollowUpLead): boolean {
  return (
    lead.status === 'assigned' &&
    (lead.contact_attempt_round ?? 0) >= MAX_RETRY_WAIT_ROUND
  )
}

export type ContactAttemptResult =
  | { kind: 'unable_to_contact'; update: Record<string, unknown> }
  | { kind: 'contact_attempted'; update: Record<string, unknown> }

export function buildContactAttemptUpdate(lead: ContactFollowUpLead): ContactAttemptResult {
  if (shouldMarkUnableToContact(lead)) {
    return {
      kind: 'unable_to_contact',
      update: {
        status: 'lost',
        lost_reason: LOST_REASON_UNABLE_TO_CONTACT,
        timer_expires_at: null,
      },
    }
  }

  return {
    kind: 'contact_attempted',
    update: {
      status: 'contact_attempted',
      last_contact_attempted_at: new Date().toISOString(),
      timer_expires_at: null,
    },
  }
}

export function getContactFollowUpState(lastAttemptAt: string | null | undefined): {
  elapsedMs: number
  label: string
} {
  const elapsedMs = lastAttemptAt
    ? Math.max(0, Date.now() - new Date(lastAttemptAt).getTime())
    : 0
  const totalMinutes = Math.floor(elapsedMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const label = hours > 0 ? `${hours}h ${minutes}m` : `${Math.max(minutes, 0)}m`
  return { elapsedMs, label }
}

interface SortableLead extends ContactFollowUpLead {
  created_at?: string
  timer_expires_at?: string | null
}

export async function processContactFollowUpRollovers<T extends ContactFollowUpLead>(
  leads: T[],
  applyUpdate: (leadId: string, update: Record<string, unknown>) => Promise<boolean>,
  logEvent: (
    leadId: string,
    eventType: 'second_attempt_started' | 'third_attempt_started',
    note: string,
    payload: Record<string, unknown>
  ) => Promise<void>
): Promise<T[]> {
  let result = leads
  for (const lead of leadsDueForFollowUpRollover(leads)) {
    const update = buildFollowUpRolloverUpdate(lead)
    const ok = await applyUpdate(lead.id, update)
    if (!ok) continue

    const nextRound = update.contact_attempt_round as number
    const label = getAttemptPhaseLabel(nextRound) ?? 'Retry'
    await logEvent(
      lead.id,
      rolloverEventType(nextRound),
      `${label} — no contact in 4 hours`,
      {
        from_status: 'contact_attempted',
        to_status: 'assigned',
        contact_attempt_round: nextRound,
      }
    )
    result = result.map((row) => (row.id === lead.id ? { ...row, ...update } : row)) as T[]
  }
  return result
}

export function sortLeadsForKanbanColumn<T extends SortableLead>(leads: T[], columnStatus: string): T[] {
  if (columnStatus === 'contact_attempted') {
    return [...leads].sort((a, b) => {
      const aTs = a.last_contact_attempted_at ? new Date(a.last_contact_attempted_at).getTime() : 0
      const bTs = b.last_contact_attempted_at ? new Date(b.last_contact_attempted_at).getTime() : 0
      if (aTs !== bTs) return aTs - bTs
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    })
  }

  if (columnStatus === 'assigned') {
    return [...leads].sort((a, b) => {
      const aRound = a.contact_attempt_round ?? 0
      const bRound = b.contact_attempt_round ?? 0
      if (aRound !== bRound) return bRound - aRound
      const aTimer = a.timer_expires_at ? new Date(a.timer_expires_at).getTime() : Number.MAX_SAFE_INTEGER
      const bTimer = b.timer_expires_at ? new Date(b.timer_expires_at).getTime() : Number.MAX_SAFE_INTEGER
      if (aTimer !== bTimer) return aTimer - bTimer
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    })
  }

  return leads
}
