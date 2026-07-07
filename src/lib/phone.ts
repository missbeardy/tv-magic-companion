/** Format AU numbers for Twilio (E.164). */
export function formatAuPhoneForSms(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return phone.trim()
  if (digits.startsWith('61')) return `+${digits}`
  if (digits.startsWith('0')) return `+61${digits.slice(1)}`
  return `+${digits}`
}

/** Format AU numbers for device tel: links (local 0… or +61…). */
export function formatAuPhoneForTel(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return phone.trim()
  if (digits.startsWith('61')) return `+${digits}`
  if (digits.startsWith('0')) return digits
  return digits
}
