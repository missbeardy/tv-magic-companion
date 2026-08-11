import { haversineKm } from './haversine.js'

export interface TeamAutoAssignCandidate {
  id: string
  full_name: string
  lat?: number | null
  lng?: number | null
  created_at: string
}

export interface TeamAutoAssignInput {
  candidates: TeamAutoAssignCandidate[]
  activeCounts: Record<string, number>
  leadLat?: number | null
  leadLng?: number | null
}

/**
 * Choose the pool of candidates to run selection over.
 * Prefer technicians not currently on leave; if every technician is on leave (or
 * there are none), fall back to managers. The manager fallback intentionally
 * ignores leave — a lead must still land with someone who can act on it.
 *
 * `allowManagerFallback: false` disables that fallback. The caller passes this
 * when the lead matched a job exclusion (T1.14): the fallback exists for "nobody
 * is around", not "nobody is qualified", so specialist work must go to the pool
 * for a human to route rather than defaulting onto a manager.
 */
export function selectAssignmentPool(input: {
  techs: TeamAutoAssignCandidate[]
  managers: TeamAutoAssignCandidate[]
  onLeaveIds: Set<string>
  allowManagerFallback?: boolean
}): TeamAutoAssignCandidate[] {
  const availableTechs = input.techs.filter((t) => !input.onLeaveIds.has(t.id))
  if (availableTechs.length > 0) return availableTechs
  if (input.allowManagerFallback === false) return []
  return input.managers
}

/** Pick the best assignee: min workload, then nearest, then earliest profile. */
export function pickTeamAutoAssignee(input: TeamAutoAssignInput): string | null {
  const { candidates, activeCounts, leadLat, leadLng } = input
  if (candidates.length === 0) return null

  const minCount = Math.min(...candidates.map((c) => activeCounts[c.id] ?? 0))
  const tied = candidates.filter((c) => (activeCounts[c.id] ?? 0) === minCount)
  if (tied.length === 1) return tied[0].id

  const hasLeadCoords = leadLat != null && leadLng != null
  if (hasLeadCoords) {
    const withDistance = tied
      .map((c) => {
        if (c.lat == null || c.lng == null) return { id: c.id, km: null as number | null, created_at: c.created_at }
        return { id: c.id, km: haversineKm(leadLat, leadLng, c.lat, c.lng), created_at: c.created_at }
      })
      .sort((a, b) => {
        if (a.km == null && b.km == null) return a.created_at.localeCompare(b.created_at)
        if (a.km == null) return 1
        if (b.km == null) return -1
        if (a.km !== b.km) return a.km - b.km
        return a.created_at.localeCompare(b.created_at)
      })
    return withDistance[0]?.id ?? null
  }

  const sorted = [...tied].sort((a, b) => a.created_at.localeCompare(b.created_at))
  return sorted[0]?.id ?? null
}
