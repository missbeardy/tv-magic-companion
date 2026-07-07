import { getExpiresAt } from './timer'

export type PoolPickupSource =
  | 'call_auto_assign'
  | 'sms_auto_assign'
  | 'manual_contact'
  | 'drag'
  | 'status_menu'

export function isPoolLead(status: string): boolean {
  return status === 'unassigned'
}

/** True when leaving the unassigned pool should assign the lead to the actor. */
export function shouldPoolPickup(
  fromStatus: string,
  toStatus: string,
  actorId: string | null | undefined
): boolean {
  return Boolean(actorId && fromStatus === 'unassigned' && toStatus !== 'unassigned')
}

/** Extra lead fields when picking up a pool lead (assign to actor). */
export function buildPoolPickupUpdate(
  fromStatus: string,
  toStatus: string,
  actorId: string | null | undefined
): Record<string, unknown> {
  if (!shouldPoolPickup(fromStatus, toStatus, actorId)) {
    return {}
  }

  const update: Record<string, unknown> = {
    assigned_to: actorId,
    assigned_at: new Date().toISOString(),
  }

  if (toStatus === 'assigned') {
    update.timer_expires_at = getExpiresAt()
  }

  return update
}

export const ASSIGNMENT_REQUIRED_MESSAGE =
  'This lead needs to be assigned before its status can change'

/** True when a status change would leave a lead in a non-unassigned status with nobody assigned. */
export function blocksUnassignedStatusChange(
  newStatus: string,
  effectiveAssignedTo: string | null | undefined
): boolean {
  return newStatus !== 'unassigned' && !effectiveAssignedTo
}
