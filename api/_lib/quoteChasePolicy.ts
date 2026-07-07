import { getPlatformUrl } from './platformUrl.js'

export const FOLLOW_UP_LADDER_HOURS = [48, 120] as const
export const MAX_FOLLOW_UP_COUNT = 2

const MS_PER_HOUR = 3_600_000

export function hoursSinceSent(sentAt: Date, now: Date): number {
  return (now.getTime() - sentAt.getTime()) / MS_PER_HOUR
}

export function firstName(customerName: string | null | undefined): string {
  const trimmed = customerName?.trim()
  if (!trimmed) return 'there'
  const token = trimmed.split(/\s+/)[0]
  return token || 'there'
}

export function formatJobService(serviceType: string | null | undefined): string {
  const trimmed = serviceType?.trim()
  return trimmed || 'your job'
}

export function buildQuoteLink(publicToken: string): string {
  return `${getPlatformUrl()}/quote/${publicToken}`
}

export type FollowUpStage = 1 | 2

/** Resolve the next follow-up stage, or null if not due. */
export function resolveFollowUpStage(
  followUpCount: number,
  sentAt: Date,
  lastFollowedUpAt: Date | null,
  now: Date
): FollowUpStage | null {
  if (followUpCount >= MAX_FOLLOW_UP_COUNT) return null

  const stage = (followUpCount + 1) as FollowUpStage
  const hoursSince = hoursSinceSent(sentAt, now)
  const thresholdHours = FOLLOW_UP_LADDER_HOURS[followUpCount]
  if (hoursSince < thresholdHours) return null

  if (lastFollowedUpAt) {
    const boundary = new Date(sentAt.getTime() + FOLLOW_UP_LADDER_HOURS[stage - 1] * MS_PER_HOUR)
    if (lastFollowedUpAt.getTime() >= boundary.getTime()) return null
  }

  return stage
}

export function followUpTemplateKey(stage: FollowUpStage): string {
  return `quote_chase_stage_${stage}`
}
