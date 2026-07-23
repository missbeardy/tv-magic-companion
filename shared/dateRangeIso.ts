/** Inclusive day bounds for YYYY-MM-DD date strings (shared by CSV export + Xero sync). */

export function endOfDayIso(dateYmd: string): string {
  return `${dateYmd}T23:59:59.999`
}

export function startOfDayIso(dateYmd: string): string {
  return `${dateYmd}T00:00:00.000`
}
