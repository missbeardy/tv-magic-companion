/** GST component of a GST-inclusive (gross) amount, using the standard divide-by-11 rule. */
export function gstComponentOf(grossAmount: number): number {
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return 0
  const grossCents = Math.round(grossAmount * 100)
  const gstCents = Math.round(grossCents / 11)
  return gstCents / 100
}

/** True when the input contains exactly 11 digits (ignoring whitespace) — the ABN format. */
export function isValidAbnFormat(raw: string): boolean {
  return /^\d{11}$/.test(raw.replace(/\s+/g, ''))
}

/** Formats an 11-digit ABN as "NN NNN NNN NNN". Returns the trimmed input unchanged if not 11 digits. */
export function formatAbn(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 11) return raw.trim()
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`
}
