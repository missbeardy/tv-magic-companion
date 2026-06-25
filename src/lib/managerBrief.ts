import { addMonths, getMonthKey, getMonthStart } from './reporting/dateRange'

const STORAGE_KEY = 'companion-manager-brief-seen-month'

export function getCurrentManagerBriefCycle(date = new Date()): string {
  return getMonthKey(getMonthStart(date))
}

export function getPreviousMonthStart(date = new Date()): Date {
  return addMonths(getMonthStart(date), -1)
}

function getSeenManagerBriefCycle(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function shouldShowManagerBrief(date = new Date()): boolean {
  return getSeenManagerBriefCycle() !== getCurrentManagerBriefCycle(date)
}

export function markManagerBriefSeen(date = new Date()): void {
  try {
    localStorage.setItem(STORAGE_KEY, getCurrentManagerBriefCycle(date))
  } catch {
    // private browsing / storage blocked
  }
}
