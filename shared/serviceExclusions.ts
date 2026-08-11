/**
 * Per-technician job exclusions (T1.14) — "this person cannot do X".
 *
 * Server-safe: no Vite/env imports, so both `api/` and `src/` can use it.
 *
 * Exclusions are matched against the raw inbound text rather than
 * `leads.service_type`, for two reasons found during planning:
 *
 *  1. `service_type` is free text with no catalog, no enum and no CHECK. The
 *     hardcoded lists inside the Claude prompts disagree with each other and none
 *     of them contains "Starlink" — it classifies as "Other" today.
 *  2. Auto-assign runs inside `insertRawFirstLead`, *before* Claude extraction
 *     resolves `service_type`, so that column still holds the raw-first
 *     placeholder ('Other' / 'General Enquiry') at decision time.
 *
 * Matching is word-prefix anchored: a keyword must begin at a word boundary but
 * may run into the rest of the word. So "starlink" matches "Starlink", "starlinks"
 * and "Starlink," — but "tv" does not match "cctv".
 */

/** Lowercase, punctuation to spaces, collapse runs of whitespace. */
export function normaliseText(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Normalise a single exclusion keyword. Returns '' for junk/empty input. */
export function normaliseKeyword(raw: string | null | undefined): string {
  return normaliseText(raw)
}

/** Clean a user-supplied keyword list: normalise, drop empties, dedupe, cap. */
export function normaliseKeywordList(
  raw: unknown,
  options?: { maxKeywords?: number; maxLength?: number }
): string[] {
  const maxKeywords = options?.maxKeywords ?? 20
  const maxLength = options?.maxLength ?? 40
  if (!Array.isArray(raw)) return []

  const seen = new Set<string>()
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const keyword = normaliseKeyword(entry).slice(0, maxLength).trim()
    if (!keyword) continue
    seen.add(keyword)
    if (seen.size >= maxKeywords) break
  }
  return [...seen]
}

/**
 * Build the text an exclusion is matched against. Pass every field that might
 * carry the customer's own words — service type, details, and the raw channel
 * payload — since the structured fields are unreliable at assign time.
 */
export function buildExclusionHaystack(parts: Array<unknown>): string {
  return normaliseText(parts.filter((p) => typeof p === 'string').join(' '))
}

/** Keywords that fire against this haystack, in the order they were configured. */
export function matchedExclusions(
  keywords: string[] | null | undefined,
  haystack: string
): string[] {
  if (!keywords?.length) return []

  // Pad so a keyword at the very start still sits behind a boundary.
  const padded = ` ${normaliseText(haystack)} `
  if (padded.trim() === '') return []

  return keywords.filter((raw) => {
    const keyword = normaliseKeyword(raw)
    return keyword !== '' && padded.includes(` ${keyword}`)
  })
}

/** True when any of this person's exclusions appear in the lead text. */
export function isExcludedFor(
  keywords: string[] | null | undefined,
  haystack: string
): boolean {
  return matchedExclusions(keywords, haystack).length > 0
}

export interface ExcludableCandidate {
  id: string
  excluded_service_keywords?: string[] | null
}

/** Drop candidates whose exclusions match the lead text. */
export function filterExcludedCandidates<T extends ExcludableCandidate>(
  candidates: T[],
  haystack: string
): T[] {
  return candidates.filter((c) => !isExcludedFor(c.excluded_service_keywords, haystack))
}
