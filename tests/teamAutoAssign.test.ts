import { describe, expect, it } from 'vitest'
import { pickTeamAutoAssignee, selectAssignmentPool } from '../shared/teamAutoAssign'
import { filterExcludedCandidates } from '../shared/serviceExclusions'

const baseCandidates = [
  { id: 'a', full_name: 'Alice', lat: -27.47, lng: 153.02, created_at: '2026-01-01T00:00:00Z' },
  { id: 'b', full_name: 'Bob', lat: -27.5, lng: 153.1, created_at: '2026-01-02T00:00:00Z' },
  { id: 'c', full_name: 'Carol', lat: null, lng: null, created_at: '2026-01-03T00:00:00Z' },
]

describe('pickTeamAutoAssignee', () => {
  it('returns null when no candidates', () => {
    expect(pickTeamAutoAssignee({ candidates: [], activeCounts: {} })).toBeNull()
  })

  it('picks profile with minimum active assigned count', () => {
    const pick = pickTeamAutoAssignee({
      candidates: baseCandidates,
      activeCounts: { a: 2, b: 1, c: 1 },
    })
    expect(['b', 'c']).toContain(pick)
  })

  it('tiebreaks by nearest when lead coordinates exist', () => {
    const pick = pickTeamAutoAssignee({
      candidates: baseCandidates,
      activeCounts: { a: 0, b: 0, c: 0 },
      leadLat: -27.47,
      leadLng: 153.02,
    })
    expect(pick).toBe('a')
  })

  it('tiebreaks by created_at when no lead coordinates', () => {
    const pick = pickTeamAutoAssignee({
      candidates: baseCandidates,
      activeCounts: { a: 0, b: 0, c: 0 },
    })
    expect(pick).toBe('a')
  })
})

describe('selectAssignmentPool', () => {
  const techs = [
    { id: 'a', full_name: 'Alice', lat: null, lng: null, created_at: '2026-01-01T00:00:00Z' },
    { id: 'b', full_name: 'Bob', lat: null, lng: null, created_at: '2026-01-02T00:00:00Z' },
  ]
  const managers = [
    { id: 'm', full_name: 'Mona', lat: null, lng: null, created_at: '2026-01-01T00:00:00Z' },
  ]

  it('returns all technicians when none are on leave', () => {
    const pool = selectAssignmentPool({ techs, managers, onLeaveIds: new Set() })
    expect(pool.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('excludes a technician who is on leave', () => {
    const pool = selectAssignmentPool({ techs, managers, onLeaveIds: new Set(['a']) })
    expect(pool.map((c) => c.id)).toEqual(['b'])
  })

  it('falls back to managers (ignoring leave) when all technicians are on leave', () => {
    const pool = selectAssignmentPool({ techs, managers, onLeaveIds: new Set(['a', 'b']) })
    expect(pool.map((c) => c.id)).toEqual(['m'])
  })

  it('returns empty when all technicians are on leave and there are no managers', () => {
    const pool = selectAssignmentPool({ techs, managers: [], onLeaveIds: new Set(['a', 'b']) })
    expect(pool).toEqual([])
  })
})

// How api/_lib/teamInboundLead.ts composes job exclusions (T1.14) with pool
// selection: both lists are filtered *before* selectAssignmentPool, so the manager
// fallback can never hand a lead to someone flagged as unable to do it.
describe('job exclusions feeding the assignment pool', () => {
  const techs = [
    { id: 'darren', full_name: 'Darren', lat: null, lng: null, created_at: '2026-01-01T00:00:00Z', excluded_service_keywords: ['starlink'] },
    { id: 'sam', full_name: 'Sam', lat: null, lng: null, created_at: '2026-01-02T00:00:00Z', excluded_service_keywords: [] },
  ]
  const managers = [
    { id: 'mona', full_name: 'Mona', lat: null, lng: null, created_at: '2026-01-01T00:00:00Z', excluded_service_keywords: ['starlink'] },
  ]

  function poolFor(haystack: string, onLeaveIds = new Set<string>()) {
    return selectAssignmentPool({
      techs: filterExcludedCandidates(techs, haystack),
      managers: filterExcludedCandidates(managers, haystack),
      onLeaveIds,
    })
  }

  it('drops the excluded technician and assigns the work to someone else', () => {
    const pool = poolFor('starlink installation plus wifi extender')
    expect(pool.map((c) => c.id)).toEqual(['sam'])
    expect(pickTeamAutoAssignee({ candidates: pool, activeCounts: { darren: 0, sam: 9 } })).toBe('sam')
  })

  it('keeps the excluded technician eligible for unrelated work', () => {
    expect(poolFor('tv aerial not working').map((c) => c.id)).toEqual(['darren', 'sam'])
  })

  it('does not fall back to an excluded manager when every technician is excluded', () => {
    // Sam is on leave, Darren is excluded, and the only manager is excluded too.
    const pool = poolFor('starlink please', new Set(['sam']))
    expect(pool).toEqual([])
    expect(pickTeamAutoAssignee({ candidates: pool, activeCounts: {} })).toBeNull()
  })
})

// Regression: prod 11-08-2026. Adding an exclusion to every technician emptied the
// tech pool, which tripped the on-leave manager fallback and silently routed the
// lead to a manager who merely happened to have no exclusion. The fallback is for
// "nobody is around", not "nobody is qualified".
describe('manager fallback is suppressed once an exclusion matches', () => {
  const techs = [
    { id: 'kyle', full_name: 'Kyle', lat: null, lng: null, created_at: '2026-01-01T00:00:00Z' },
    { id: 'darren', full_name: 'Darren', lat: null, lng: null, created_at: '2026-01-02T00:00:00Z' },
  ]
  const managers = [
    { id: 'nick', full_name: 'Nick', lat: null, lng: null, created_at: '2026-01-01T00:00:00Z' },
  ]

  it('leaves the pool empty rather than handing the lead to an unexcluded manager', () => {
    const pool = selectAssignmentPool({
      techs: [],
      managers,
      onLeaveIds: new Set(),
      allowManagerFallback: false,
    })
    expect(pool).toEqual([])
    expect(pickTeamAutoAssignee({ candidates: pool, activeCounts: {} })).toBeNull()
  })

  it('still falls back to a manager when the pool emptied for leave, not exclusions', () => {
    const pool = selectAssignmentPool({
      techs,
      managers,
      onLeaveIds: new Set(['kyle', 'darren']),
      allowManagerFallback: true,
    })
    expect(pool.map((c) => c.id)).toEqual(['nick'])
  })

  it('defaults to allowing the fallback when the flag is omitted (pre-T1.14 behaviour)', () => {
    const pool = selectAssignmentPool({ techs: [], managers, onLeaveIds: new Set() })
    expect(pool.map((c) => c.id)).toEqual(['nick'])
  })

  it('an eligible technician still wins over the fallback question entirely', () => {
    const pool = selectAssignmentPool({
      techs: [techs[0]],
      managers,
      onLeaveIds: new Set(),
      allowManagerFallback: false,
    })
    expect(pool.map((c) => c.id)).toEqual(['kyle'])
  })
})
