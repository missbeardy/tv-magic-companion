import type { OperationMode } from './operationMode'

const SOLO_ASSIGN_TIMER_HOURS = 24

/** Client-side solo fields when manually creating a lead. */
export function buildSoloManualLeadFields(
  operationMode: OperationMode | undefined,
  ownerProfileId: string | undefined
): Record<string, unknown> {
  if (operationMode !== 'solo' || !ownerProfileId) {
    return { status: 'unassigned' }
  }

  const timerExpires = new Date()
  timerExpires.setHours(timerExpires.getHours() + SOLO_ASSIGN_TIMER_HOURS)

  return {
    status: 'assigned',
    assigned_to: ownerProfileId,
    assigned_at: new Date().toISOString(),
    timer_expires_at: timerExpires.toISOString(),
  }
}
