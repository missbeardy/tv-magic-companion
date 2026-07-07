export const INVOICE_DUE_DAYS = 14
export const CHASE_LADDER_DAYS = [3, 7, 14] as const
export const MAX_CHASE_COUNT = 3

const MS_PER_DAY = 86_400_000

export function deriveDueAt(sentAt: Date): Date {
  const due = new Date(sentAt.getTime())
  due.setDate(due.getDate() + INVOICE_DUE_DAYS)
  return due
}

export function daysOverdue(sentAt: Date, now: Date): number {
  const dueAt = deriveDueAt(sentAt)
  if (now.getTime() <= dueAt.getTime()) return 0
  return Math.floor((now.getTime() - dueAt.getTime()) / MS_PER_DAY)
}

export function formatDueDateEnAu(sentAt: Date): string {
  return deriveDueAt(sentAt).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatInvoiceAmount(amount: number, currency = 'AUD'): string {
  return `${currency} ${Number(amount).toFixed(2)}`
}

export function firstName(customerName: string | null | undefined): string {
  const trimmed = customerName?.trim()
  if (!trimmed) return 'there'
  const token = trimmed.split(/\s+/)[0]
  return token || 'there'
}

export type ChaseStage = 1 | 2 | 3

/** Resolve the next chase stage, or null if not due. */
export function resolveChaseStage(
  chaseCount: number,
  daysOverdueCount: number,
  lastChasedAt: Date | null,
  dueAt: Date
): ChaseStage | null {
  if (chaseCount >= MAX_CHASE_COUNT) return null

  const stage = (chaseCount + 1) as ChaseStage
  const threshold = CHASE_LADDER_DAYS[chaseCount]
  if (daysOverdueCount < threshold) return null

  if (lastChasedAt) {
    const previousBoundary = new Date(dueAt.getTime())
    previousBoundary.setDate(previousBoundary.getDate() + CHASE_LADDER_DAYS[stage - 1])
    if (lastChasedAt.getTime() >= previousBoundary.getTime()) return null
  }

  return stage
}

export function chaseTemplateKey(stage: ChaseStage): string {
  return `invoice_chase_stage_${stage}`
}
