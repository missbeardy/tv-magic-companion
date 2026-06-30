const AU_STATE_PATTERN = /\s+(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s*(\d{4})?$/i
const AU_STATE_TOKEN = /\b(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\b/i

/** Extract suburb/locality from a free-form Australian address string. */
export function extractSuburbFromAddress(address: string | null | undefined): string | null {
  const trimmed = address?.trim()
  if (!trimmed) return null

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean)

  if (parts.length >= 2) {
    const localityPart = parts.length === 2 ? parts[1] : parts[parts.length - 2]
    const withoutState = localityPart.replace(AU_STATE_PATTERN, '').trim()
    if (withoutState) return withoutState
  }

  const trailingState = trimmed.match(
    /^(.+?)\s+(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s+\d{4}$/i
  )
  if (trailingState) {
    const beforeState = trailingState[1].trim()
    const tokens = beforeState.split(/\s+/)
    if (tokens.length >= 2) {
      return tokens[tokens.length - 1]
    }
  }

  return null
}

export function extractStateFromAddress(address: string | null | undefined): string | null {
  const trimmed = address?.trim()
  if (!trimmed) return null
  const match = trimmed.match(AU_STATE_TOKEN)
  return match ? match[1].toUpperCase() : null
}

/** e.g. "Tarragindi, QLD" — suburb plus state when available. */
export function formatLocalityLabelFromAddress(address: string | null | undefined): string | null {
  const suburb = extractSuburbFromAddress(address)
  if (!suburb) return null
  const state = extractStateFromAddress(address)
  return state ? `${suburb}, ${state}` : suburb
}
