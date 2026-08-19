import { describe, expect, it } from 'vitest'
import {
  getBusinessNow,
  getBusinessWeekStartKey,
  getNudgeWeekStartKey,
  isNudgeWindow,
} from '../shared/leaderboardWeek'

/**
 * Every case here is expressed as a UTC instant that lands on a *different* Sydney
 * clock reading, because that difference is the entire point of the module. A test
 * written in local time would pass on a Sydney laptop and prove nothing.
 */
describe('getBusinessNow', () => {
  it('reads the Sydney wall clock, not the host clock', () => {
    // 2026-08-16 20:00 UTC is Sunday in UTC but Monday 06:00 in Sydney (AEST, +10).
    const now = getBusinessNow(new Date('2026-08-16T20:00:00Z'))
    expect(now).toMatchObject({ year: 2026, month: 8, day: 17, hour: 6, isoWeekday: 1 })
  })

  it('follows daylight saving rather than a fixed offset', () => {
    // Same UTC hour in November is AEDT (+11), so Sydney is an hour further ahead.
    const aest = getBusinessNow(new Date('2026-08-21T06:00:00Z'))
    const aedt = getBusinessNow(new Date('2026-11-06T06:00:00Z'))
    expect(aest.hour).toBe(16)
    expect(aedt.hour).toBe(17)
  })

  it('numbers weekdays the way Postgres ISODOW does', () => {
    expect(getBusinessNow(new Date('2026-08-21T06:00:00Z')).isoWeekday).toBe(5)
    // Sunday 23:00 Sydney — the far end of the week, still weekday 7.
    expect(getBusinessNow(new Date('2026-08-23T13:00:00Z')).isoWeekday).toBe(7)
  })
})

describe('getBusinessWeekStartKey', () => {
  it('returns the Monday of the Sydney week', () => {
    expect(getBusinessWeekStartKey(new Date('2026-08-19T02:00:00Z'))).toBe('2026-08-17')
  })

  it('rolls to the new week on Sydney Monday, not UTC Monday', () => {
    // Sydney has already ticked over to Monday; UTC is still Sunday.
    expect(getBusinessWeekStartKey(new Date('2026-08-16T20:00:00Z'))).toBe('2026-08-17')
    // Sydney is still Sunday night — the week before.
    expect(getBusinessWeekStartKey(new Date('2026-08-16T13:00:00Z'))).toBe('2026-08-10')
  })

  it('keeps a Sunday in the week that opened the Monday before', () => {
    expect(getBusinessWeekStartKey(new Date('2026-08-23T01:00:00Z'))).toBe('2026-08-17')
  })

  it('crosses a month boundary without slipping', () => {
    // Sydney Tuesday 1 Sep 2026 belongs to the week that started Mon 31 Aug.
    expect(getBusinessWeekStartKey(new Date('2026-09-01T02:00:00Z'))).toBe('2026-08-31')
  })

  it('produces the exact shape week_start stores', () => {
    expect(getBusinessWeekStartKey(new Date('2026-08-19T02:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('isNudgeWindow', () => {
  it('fires the manager reminder at Saturday 5pm Sydney', () => {
    expect(isNudgeWindow('remind', new Date('2026-08-22T07:00:00Z'))).toBe(true)
    expect(isNudgeWindow('remind', new Date('2026-08-22T06:00:00Z'))).toBe(false)
  })

  it('fires the team reveal at Monday 8am Sydney', () => {
    expect(isNudgeWindow('reveal', new Date('2026-08-23T22:00:00Z'))).toBe(true)
    expect(isNudgeWindow('reveal', new Date('2026-08-23T21:00:00Z'))).toBe(false)
  })

  it('picks the other UTC hour once daylight saving starts', () => {
    // Both workflow ticks reach the server; only the one that is 8am in Sydney counts.
    expect(isNudgeWindow('reveal', new Date('2026-11-08T21:00:00Z'))).toBe(true)
    expect(isNudgeWindow('reveal', new Date('2026-11-08T22:00:00Z'))).toBe(false)
    expect(isNudgeWindow('remind', new Date('2026-11-07T06:00:00Z'))).toBe(true)
    expect(isNudgeWindow('remind', new Date('2026-11-07T07:00:00Z'))).toBe(false)
  })

  it('never fires on the wrong day', () => {
    // Monday 5pm Sydney — right hour for neither phase's day.
    expect(isNudgeWindow('remind', new Date('2026-08-24T07:00:00Z'))).toBe(false)
    // Saturday 8am Sydney.
    expect(isNudgeWindow('reveal', new Date('2026-08-21T22:00:00Z'))).toBe(false)
  })

  it('keeps the two phases apart', () => {
    const mondayMorning = new Date('2026-08-23T22:00:00Z')
    expect(isNudgeWindow('reveal', mondayMorning)).toBe(true)
    expect(isNudgeWindow('remind', mondayMorning)).toBe(false)
  })
})

/**
 * The two phases are about different weeks, and getting this wrong is the difference
 * between celebrating the week that just happened and announcing an empty one.
 */
describe('getNudgeWeekStartKey', () => {
  it('reminds about the week that is closing', () => {
    // Saturday 22 Aug sits inside the week that opened Monday 17 Aug.
    expect(getNudgeWeekStartKey('remind', new Date('2026-08-22T07:00:00Z'))).toBe('2026-08-17')
  })

  it('reveals the week that closed last night, not the one starting today', () => {
    // Monday 24 Aug 08:00 Sydney — the new week has begun, so the reveal steps back.
    expect(getNudgeWeekStartKey('reveal', new Date('2026-08-23T22:00:00Z'))).toBe('2026-08-17')
  })

  it('steps back across a month boundary', () => {
    // Monday 7 Sep 2026 reveals the week that opened Monday 31 Aug.
    expect(getNudgeWeekStartKey('reveal', new Date('2026-09-06T22:00:00Z'))).toBe('2026-08-31')
  })

  it('always lands on a Monday, whichever phase asked', () => {
    for (const iso of ['2026-08-22T07:00:00Z', '2026-08-23T22:00:00Z', '2026-11-08T21:00:00Z']) {
      for (const phase of ['remind', 'reveal'] as const) {
        const key = getNudgeWeekStartKey(phase, new Date(iso))
        expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        // Parsed as UTC noon so the weekday cannot slip on the host timezone.
        const [y, m, d] = key.split('-').map(Number)
        expect(new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()).toBe(1)
      }
    }
  })

  it('puts the reveal exactly one week behind the remind', () => {
    const remind = getNudgeWeekStartKey('remind', new Date('2026-08-23T22:00:00Z'))
    const reveal = getNudgeWeekStartKey('reveal', new Date('2026-08-23T22:00:00Z'))
    expect(remind).toBe('2026-08-24')
    expect(reveal).toBe('2026-08-17')
  })
})
