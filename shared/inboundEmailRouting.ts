/** CloudMailin envelope shape (JSON / normalised multipart). */
export interface CloudmailinEnvelope {
  to?: string
  from?: string
  recipients?: string[]
}

export interface CloudmailinInboundPayload {
  envelope?: CloudmailinEnvelope
  headers?: Record<string, string | string[]>
}

/** Strip display name and angle brackets from an address string. */
export function normalizeEmailAddress(raw: string): string {
  const trimmed = raw.trim()
  const angle = trimmed.match(/<([^>]+)>/)
  return (angle?.[1] ?? trimmed).trim().toLowerCase()
}

/**
 * Extract the plus-tag from a plus-addressed email (e.g. 56465431321+clientA@cloudmailin.net → clienta).
 * Returns null when no plus-tag is present.
 */
export function parsePlusTagFromEmailAddress(address: string): string | null {
  const email = normalizeEmailAddress(address)
  const at = email.lastIndexOf('@')
  if (at <= 0) return null

  const local = email.slice(0, at)
  const plus = local.indexOf('+')
  if (plus < 0 || plus === local.length - 1) return null

  const tag = local.slice(plus + 1)
  return tag.length > 0 ? tag : null
}

/** Collect SMTP envelope + header recipient addresses from a CloudMailin webhook body. */
export function extractCloudmailinRecipients(body: CloudmailinInboundPayload): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  function add(raw: string | undefined) {
    if (!raw?.trim()) return
    const normalized = normalizeEmailAddress(raw)
    if (!seen.has(normalized)) {
      seen.add(normalized)
      out.push(normalized)
    }
  }

  const envelope = body.envelope
  if (envelope?.to) add(envelope.to)
  for (const recipient of envelope?.recipients ?? []) add(recipient)

  const headerTo = body.headers?.to ?? body.headers?.To
  if (Array.isArray(headerTo)) {
    for (const entry of headerTo) add(entry)
  } else if (typeof headerTo === 'string') {
    for (const part of headerTo.split(',')) add(part)
  }

  return out
}

/** Unique plus-tags found across recipient addresses (order preserved). */
export function extractPlusTagsFromRecipients(recipients: string[]): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const address of recipients) {
    const tag = parsePlusTagFromEmailAddress(address)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  return tags
}

/**
 * Build the CloudMailin plus-address for an org tag.
 * `base` is the shared inbox local part + domain, e.g. 56465431321@cloudmailin.net
 */
export function buildCloudmailinPlusAddress(base: string, tag: string): string {
  const trimmed = base.trim().toLowerCase()
  const at = trimmed.indexOf('@')
  if (at <= 0) return `${trimmed}+${tag}`

  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  const baseLocal = local.includes('+') ? local.slice(0, local.indexOf('+')) : local
  return `${baseLocal}+${tag}@${domain}`
}
