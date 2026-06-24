import type { ReportPeriod } from './types'

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-AU', {
  month: 'long',
  year: 'numeric',
})

export function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addMonths(monthStart: Date, delta: number): Date {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + delta, 1)
}

export function getMonthKey(monthStart: Date): string {
  const y = monthStart.getFullYear()
  const m = String(monthStart.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function formatMonthLabel(monthStart: Date): string {
  return MONTH_FORMATTER.format(monthStart)
}

export function buildReportPeriod(monthStart: Date): ReportPeriod {
  const normalizedStart = getMonthStart(monthStart)
  const end = addMonths(normalizedStart, 1)

  return {
    monthStart: normalizedStart,
    monthEnd: end,
    startIso: normalizedStart.toISOString(),
    endIso: end.toISOString(),
    monthKey: getMonthKey(normalizedStart),
    label: formatMonthLabel(normalizedStart),
  }
}

export function buildMonthOptions(firstMonth: Date, lastMonth: Date): Date[] {
  const first = getMonthStart(firstMonth)
  const last = getMonthStart(lastMonth)
  const months: Date[] = []
  let cursor = first

  while (cursor <= last) {
    months.push(cursor)
    cursor = addMonths(cursor, 1)
  }

  return months.reverse()
}
