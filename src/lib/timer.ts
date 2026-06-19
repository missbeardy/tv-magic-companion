// src/lib/timer.ts

export const PRODUCTION_TIMER_MS = 2 * 60 * 60 * 1000 // 2 hours
export const DEMO_TIMER_MS = 30 * 1000 // 30 seconds

export function getTimerDuration(demoMode: boolean): number {
  return demoMode ? DEMO_TIMER_MS : PRODUCTION_TIMER_MS
}

export function getExpiresAt(demoMode: boolean): string {
  const duration = getTimerDuration(demoMode)
  return new Date(Date.now() + duration).toISOString()
}

export function getTimeRemaining(expiresAt: string): {
  total: number
  hours: number
  minutes: number
  seconds: number
  expired: boolean
} {
  const total = new Date(expiresAt).getTime() - Date.now()

  if (total <= 0) {
    return { total: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  }

  const hours = Math.floor(total / (1000 * 60 * 60))
  const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((total % (1000 * 60)) / 1000)

  return { total, hours, minutes, seconds, expired: false }
}

export function formatTimeRemaining(expiresAt: string): string {
  const { hours, minutes, seconds, expired } = getTimeRemaining(expiresAt)
  if (expired) return 'Expired'
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  if (minutes > 0) return `${minutes}m ${seconds}s remaining`
  return `${seconds}s remaining`
}

export function isRunningLow(expiresAt: string): boolean {
  const { total, expired } = getTimeRemaining(expiresAt)
  if (expired) return false
  return total < 1 * 60 * 60 * 1000 // under 1 hour (half of the 2-hour timer)
}