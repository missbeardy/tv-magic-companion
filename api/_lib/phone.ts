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

/** True for an Australian mobile (04… / +614…). Landlines are not enough for a technician call-back. */
export function isAuMobile(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return /^(?:04\d{8}|4\d{8}|614\d{8})$/.test(digits)
}

/** True when two AU phone strings refer to the same number. */
export function phonesEqual(a: string, b: string): boolean {
  const da = a.replace(/\D/g, '')
  const db = b.replace(/\D/g, '')
  if (!da || !db) return false
  const norm = (d: string) => (d.startsWith('61') ? d.slice(2) : d.startsWith('0') ? d.slice(1) : d)
  return norm(da) === norm(db)
}

/**
 * Find the first AU mobile/landline in free text.
 * Prefers labelled Contact Phone / Phone / Mobile / Tel when present.
 */
export function findAuPhoneInText(text: string): string | null {
  if (!text?.trim()) return null

  const labelled = text.match(
    /(?:Contact\s*Phone|Phone|Mobile|Tel|Cell)[:\s]*([+\d\s()-]{8,20})/i
  )
  if (labelled?.[1]) {
    const cleaned = labelled[1].trim()
    if (isPlausibleAuPhone(cleaned)) return cleaned
  }

  // AU mobile: 04xx xxx xxx / +61 4xx xxx xxx
  const mobile = text.match(
    /(?:\+?61[\s-]?4|\(?0?4)[\d\s()-]{7,12}\d/
  )
  if (mobile?.[0] && isPlausibleAuPhone(mobile[0])) {
    return mobile[0].trim()
  }

  // AU landline: 02/03/07/08 + 8 digits
  const landline = text.match(
    /(?:\+?61[\s-]?[2378]|\(?0[2378])[\d\s()-]{7,12}\d/
  )
  if (landline?.[0] && isPlausibleAuPhone(landline[0])) {
    return landline[0].trim()
  }

  return null
}

function isPlausibleAuPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 12) return false
  // National mobile 04xxxxxxxx (10) or E.164 614xxxxxxxx (11)
  if (/^(?:0?4|614)\d{8}$/.test(digits)) return true
  // National landline 0[2378]xxxxxxxx (10) or E.164 61[2378]xxxxxxxx (11)
  if (/^(?:0?[2378]|61[2378])\d{8}$/.test(digits)) return true
  return false
}
