import { describe, it, expect, vi } from 'vitest'

// src/lib/supabase throws without VITE_* env vars; the pure logic under test never
// touches the client, so a stub keeps this file environment-free.
vi.mock('../src/lib/supabase', () => ({ supabase: {} }))

import {
  addWeeks,
  computeMovement,
  buildDraft,
  canGoToNextWeek,
  diffDraft,
  formatWeekName,
  formatWeekRange,
  getGapAbove,
  getLeaderMargin,
  getWeekEnd,
  getWeekStart,
  hasAnyResults,
  isCurrentWeek,
  mergeRosterWithEntries,
  parseDateKey,
  sortLeaderboardRows,
  toDateKey,
  validateJobs,
  validateSales,
  weeksAgo,
  type LeaderboardRow,
  type WeeklyLeaderboardEntryRow,
} from '../src/lib/leaderboard'

// Monday 17-08-2026 → Sunday 23-08-2026.
const MONDAY = new Date(2026, 7, 17)
const SUNDAY = new Date(2026, 7, 23)

function entry(
  technicianId: string,
  jobs: number,
  sales: number
): WeeklyLeaderboardEntryRow {
  return {
    id: `entry-${technicianId}`,
    org_id: 'org-1',
    technician_id: technicianId,
    week_start: '2026-08-17',
    jobs_completed: jobs,
    sales_amount: sales,
    created_at: '2026-08-17T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z',
    created_by: 'mgr-1',
    updated_by: 'mgr-1',
  }
}

function row(
  technicianId: string,
  name: string,
  jobs: number,
  sales: number
): LeaderboardRow {
  return {
    technicianId,
    name,
    avatarUrl: null,
    jobsCompleted: jobs,
    salesAmount: sales,
    hasEntry: true,
  }
}

describe('week boundaries', () => {
  it('anchors every day of the week to the same Monday', () => {
    for (let offset = 0; offset < 7; offset++) {
      const day = new Date(2026, 7, 17 + offset, 13, 45)
      expect(toDateKey(getWeekStart(day))).toBe('2026-08-17')
    }
  })

  it('puts Sunday in the week that started the Monday before, not the one after', () => {
    expect(toDateKey(getWeekStart(SUNDAY))).toBe('2026-08-17')
    // One second later is Monday, which starts a new week.
    expect(toDateKey(getWeekStart(new Date(2026, 7, 24)))).toBe('2026-08-24')
  })

  it('closes the week on the following Sunday', () => {
    expect(toDateKey(getWeekEnd(MONDAY))).toBe('2026-08-23')
  })

  it('round-trips a stored date key without a UTC shift', () => {
    const parsed = parseDateKey('2026-08-17')
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(7)
    expect(parsed.getDate()).toBe(17)
    expect(toDateKey(parsed)).toBe('2026-08-17')
  })

  it('steps whole weeks in both directions, across a month boundary', () => {
    expect(toDateKey(addWeeks(MONDAY, -3))).toBe('2026-07-27')
    expect(toDateKey(addWeeks(MONDAY, 2))).toBe('2026-08-31')
  })

  it('labels the Monday-to-Sunday span at both ends', () => {
    expect(formatWeekRange(MONDAY)).toContain('17 Aug')
    expect(formatWeekRange(MONDAY)).toContain('23 Aug 2026')
  })
})

describe('week navigation limits', () => {
  const now = new Date(2026, 7, 19, 9, 0) // Wednesday of the 17 Aug week

  it('recognises the current week', () => {
    expect(isCurrentWeek(MONDAY, now)).toBe(true)
    expect(isCurrentWeek(addWeeks(MONDAY, -1), now)).toBe(false)
  })

  it('blocks navigating into a future week', () => {
    expect(canGoToNextWeek(MONDAY, now)).toBe(false)
    expect(canGoToNextWeek(addWeeks(MONDAY, 1), now)).toBe(false)
  })

  it('allows navigating forward from a past week', () => {
    expect(canGoToNextWeek(addWeeks(MONDAY, -1), now)).toBe(true)
    expect(canGoToNextWeek(addWeeks(MONDAY, -9), now)).toBe(true)
  })

  it('counts weeks back and names the recent ones', () => {
    expect(weeksAgo(MONDAY, now)).toBe(0)
    expect(weeksAgo(addWeeks(MONDAY, -1), now)).toBe(1)
    expect(formatWeekName(MONDAY, now)).toBe('This week')
    expect(formatWeekName(addWeeks(MONDAY, -1), now)).toBe('Last week')
    expect(formatWeekName(addWeeks(MONDAY, -4), now)).toContain('Jul')
  })
})

describe('mergeRosterWithEntries', () => {
  const roster = [
    { id: 'tech-1', full_name: 'Ava Bell', avatar_url: null },
    { id: 'tech-2', full_name: 'Zed Cruz', avatar_url: 'https://example.test/z.png' },
  ]

  it('shows a visible employee with no saved row as zeros', () => {
    const merged = mergeRosterWithEntries(roster, [entry('tech-1', 4, 900)])
    const zed = merged.find((r) => r.technicianId === 'tech-2')
    expect(zed).toMatchObject({ jobsCompleted: 0, salesAmount: 0, hasEntry: false })
  })

  it('marks a technician who has a saved row', () => {
    const merged = mergeRosterWithEntries(roster, [entry('tech-1', 4, 900)])
    expect(merged.find((r) => r.technicianId === 'tech-1')).toMatchObject({
      jobsCompleted: 4,
      salesAmount: 900,
      hasEntry: true,
    })
  })

  it('drops saved rows for people no longer on the visible roster', () => {
    const merged = mergeRosterWithEntries(roster, [
      entry('tech-1', 4, 900),
      entry('hidden-test-profile', 99, 99999),
    ])
    expect(merged).toHaveLength(2)
    expect(merged.map((r) => r.technicianId)).not.toContain('hidden-test-profile')
  })

  it('falls back to a placeholder rather than rendering an empty name', () => {
    const merged = mergeRosterWithEntries([{ id: 'tech-3', full_name: '', avatar_url: null }], [])
    expect(merged[0].name).toBe('Unnamed')
  })
})

describe('sortLeaderboardRows', () => {
  it('sorts by sales descending', () => {
    const sorted = sortLeaderboardRows([
      row('a', 'Ava', 1, 100),
      row('b', 'Bob', 1, 900),
      row('c', 'Cal', 1, 500),
    ])
    expect(sorted.map((r) => r.technicianId)).toEqual(['b', 'c', 'a'])
  })

  it('breaks a sales tie on jobs completed, descending', () => {
    const sorted = sortLeaderboardRows([
      row('a', 'Ava', 2, 500),
      row('b', 'Bob', 7, 500),
    ])
    expect(sorted.map((r) => r.technicianId)).toEqual(['b', 'a'])
  })

  it('breaks a full tie on name ascending, so an all-zero week is stable', () => {
    const sorted = sortLeaderboardRows([
      row('c', 'Cal', 0, 0),
      row('a', 'Ava', 0, 0),
      row('b', 'Bob', 0, 0),
    ])
    expect(sorted.map((r) => r.name)).toEqual(['Ava', 'Bob', 'Cal'])
  })

  it('does not mutate the input array', () => {
    const input = [row('a', 'Ava', 1, 100), row('b', 'Bob', 1, 900)]
    sortLeaderboardRows(input)
    expect(input.map((r) => r.technicianId)).toEqual(['a', 'b'])
  })

  it('reports whether the week has anything worth celebrating', () => {
    expect(hasAnyResults([row('a', 'Ava', 0, 0)])).toBe(false)
    expect(hasAnyResults([row('a', 'Ava', 1, 0)])).toBe(true)
    expect(hasAnyResults([row('a', 'Ava', 0, 250)])).toBe(true)
    expect(hasAnyResults([])).toBe(false)
  })
})

describe('validateJobs', () => {
  it('accepts whole numbers and treats blank as zero', () => {
    expect(validateJobs('7')).toEqual({ ok: true, value: 7, error: null })
    expect(validateJobs('  ')).toEqual({ ok: true, value: 0, error: null })
    expect(validateJobs('0')).toEqual({ ok: true, value: 0, error: null })
  })

  it('rejects decimals, negatives, and text', () => {
    expect(validateJobs('3.5').ok).toBe(false)
    expect(validateJobs('-2').ok).toBe(false)
    expect(validateJobs('four').ok).toBe(false)
  })
})

describe('validateSales', () => {
  it('accepts what a person types on a phone', () => {
    expect(validateSales('1250').value).toBe(1250)
    expect(validateSales('$1,250.50').value).toBe(1250.5)
    expect(validateSales(' 980.00 ').value).toBe(980)
    expect(validateSales('').value).toBe(0)
  })

  it('rejects more precision than the column stores', () => {
    expect(validateSales('12.345').ok).toBe(false)
  })

  it('rejects negatives, text, and oversized amounts', () => {
    expect(validateSales('-1').ok).toBe(false)
    expect(validateSales('lots').ok).toBe(false)
    expect(validateSales('99999999999').ok).toBe(false)
  })
})

describe('diffDraft', () => {
  const rows = [row('a', 'Ava', 3, 500), row('b', 'Bob', 1, 200)]

  it('returns nothing when nothing was changed', () => {
    expect(diffDraft(rows, buildDraft(rows)).changed).toEqual([])
  })

  it('returns only the rows that actually changed', () => {
    const draft = buildDraft(rows)
    draft.b = { jobs: '4', sales: '1250.50' }
    const result = diffDraft(rows, draft)
    expect(result.changed).toEqual([
      { technicianId: 'b', jobsCompleted: 4, salesAmount: 1250.5 },
    ])
  })

  it('reports a field error instead of saving a bad value', () => {
    const draft = buildDraft(rows)
    draft.a = { jobs: 'heaps', sales: '500' }
    const result = diffDraft(rows, draft)
    expect(result.changed).toEqual([])
    expect(result.errors.a).toMatch(/whole number/i)
  })

  it('treats a cleared field as zero rather than skipping the row', () => {
    const draft = buildDraft(rows)
    draft.a = { jobs: '', sales: '' }
    expect(diffDraft(rows, draft).changed).toEqual([
      { technicianId: 'a', jobsCompleted: 0, salesAmount: 0 },
    ])
  })

  it('ignores technicians absent from the draft', () => {
    expect(diffDraft(rows, {}).changed).toEqual([])
  })
})

describe('computeMovement', () => {
  const thisWeek = [row('a', 'Ava', 3, 800), row('b', 'Bob', 9, 2400)]

  it('reports who climbed and who slipped', () => {
    // Last week Ava led, this week Bob does.
    const lastWeek = [row('a', 'Ava', 9, 3000), row('b', 'Bob', 2, 400)]
    const movement = computeMovement(thisWeek, lastWeek)
    expect(movement.get('b')).toBe(1)
    expect(movement.get('a')).toBe(-1)
  })

  it('reports zero for someone who held their place', () => {
    const lastWeek = [row('a', 'Ava', 2, 500), row('b', 'Bob', 8, 2000)]
    expect(computeMovement(thisWeek, lastWeek).get('b')).toBe(0)
  })

  it('claims no movement when last week was never posted', () => {
    const movement = computeMovement(thisWeek, [row('a', 'Ava', 0, 0), row('b', 'Bob', 0, 0)])
    expect(movement.get('a')).toBeNull()
    expect(movement.get('b')).toBeNull()
  })

  it('claims no movement for someone new to the board', () => {
    const lastWeek = [{ ...row('a', 'Ava', 3, 900) }, { ...row('b', 'Bob', 0, 0), hasEntry: false }]
    expect(computeMovement(thisWeek, lastWeek).get('b')).toBeNull()
  })

  it('covers everyone on the current board', () => {
    const movement = computeMovement(thisWeek, [])
    expect([...movement.keys()].sort()).toEqual(['a', 'b'])
  })
})

describe('gaps', () => {
  const sorted = sortLeaderboardRows([
    row('a', 'Ava', 3, 800),
    row('b', 'Bob', 9, 2400),
    row('c', 'Cal', 1, 300),
  ])

  it('measures the gap to the person directly above', () => {
    expect(getGapAbove(sorted, 1)).toBe(1600)
    expect(getGapAbove(sorted, 2)).toBe(500)
  })

  it('gives the leader no gap above them', () => {
    expect(getGapAbove(sorted, 0)).toBe(0)
  })

  it('measures how far the leader is clear', () => {
    expect(getLeaderMargin(sorted)).toBe(1600)
  })

  it('reports no margin when nobody is chasing', () => {
    expect(getLeaderMargin([row('a', 'Ava', 1, 100)])).toBe(0)
    expect(getLeaderMargin([])).toBe(0)
  })

  it('reports a dead heat as zero, not a negative', () => {
    const tied = sortLeaderboardRows([row('a', 'Ava', 2, 900), row('b', 'Bob', 5, 900)])
    expect(getLeaderMargin(tied)).toBe(0)
    expect(getGapAbove(tied, 1)).toBe(0)
  })
})
