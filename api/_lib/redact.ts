/**
 * Masks a phone number for logs, keeping just enough to eyeball-correlate two log lines
 * without a customer's full number sitting in Vercel/Sentry log retention. Works on any
 * digit-bearing format (+61412345678, 0412 345 678, etc) — strips everything else first.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 3) return '***'
  return `***${digits.slice(-3)}`
}
