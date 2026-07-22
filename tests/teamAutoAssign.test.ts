import { describe, expect, it } from 'vitest'
import { pickTeamAutoAssignee, selectAssignmentPool } from '../shared/teamAutoAssign'

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
