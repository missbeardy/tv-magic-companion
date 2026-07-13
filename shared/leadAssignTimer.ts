/** Production assign timer — matches manual assign in AssignLeadModal. */
export const LEAD_ASSIGN_TIMER_MS = 4 * 60 * 60 * 1000

export function getAssignExpiresAt(now = Date.now()): string {
  return new Date(now + LEAD_ASSIGN_TIMER_MS).toISOString()
}
