/** Candidate formats for an AU phone so DB lookups match regardless of stored format. */
export function phoneCandidates(input: string): string[] {
  const digits = input.replace(/[^0-9+]/g, '')
  const set = new Set<string>([input.trim(), digits])
  let national = digits.replace(/^\+?61/, '0').replace(/^\+/, '')
  if (national && !national.startsWith('0')) national = '0' + national
  if (national) {
    set.add(national)
    set.add('+61' + national.slice(1))
    set.add('61' + national.slice(1))
  }
  return [...set].filter(Boolean)
}

/** Format AU numbers for Twilio (E.164). */
export function formatAuPhoneForSms(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return phone.trim()
  if (digits.startsWith('61')) return `+${digits}`
  if (digits.startsWith('0')) return `+61${digits.slice(1)}`
  return `+${digits}`
}
