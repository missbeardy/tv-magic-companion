const STORAGE_KEY = 'tvm_leads_pool_coach_dismissed'

export function isLeadsPoolCoachDismissed(userId: string): boolean {
  if (typeof window === 'undefined' || !userId) return true
  try {
    return localStorage.getItem(`${STORAGE_KEY}:${userId}`) === '1'
  } catch {
    return true
  }
}

export function dismissLeadsPoolCoach(userId: string): void {
  if (typeof window === 'undefined' || !userId) return
  try {
    localStorage.setItem(`${STORAGE_KEY}:${userId}`, '1')
  } catch {
    // ignore quota / private mode
  }
}
