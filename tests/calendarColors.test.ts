import { describe, expect, it } from 'vitest'
import {
  BOOKING_CATEGORY,
  TEAM_MEETING_CATEGORY,
  buildEmployeeColorMap,
  buildEmployeePalette,
  countTeamMeetingAttendees,
  dedupeTeamMeetingsForAggregatedView,
  getEmployeeColor,
  getEventAccentColor,
  getEventCardStyles,
  getTeamMeetingAccentColor,
  isTeamMeetingCategory,
} from '../src/lib/calendarColors'

const theme = {
  primary: '#004B93',
  secondary: '#00B4C5',
  primaryDark: '#003d7a',
}

describe('calendarColors', () => {
  const employees = [
    { id: 'bbb-uuid', full_name: 'Bob' },
    { id: 'aaa-uuid', full_name: 'Alice' },
  ]

  it('builds palette from org theme tokens', () => {
    const palette = buildEmployeePalette(theme)
    expect(palette[0]).toBe(theme.primary)
    expect(palette[1]).toBe(theme.secondary)
    expect(palette.length).toBeGreaterThanOrEqual(2)
    expect(new Set(palette).size).toBeGreaterThan(1)
  })

  it('assigns stable colours sorted by id', () => {
    const map = buildEmployeeColorMap(employees, theme)
    expect(map.get('aaa-uuid')).toBe(getEmployeeColor('aaa-uuid', employees, theme))
    expect(map.get('bbb-uuid')).toBe(getEmployeeColor('bbb-uuid', employees, theme))
    expect(map.get('aaa-uuid')).not.toBe(map.get('bbb-uuid'))
  })

  it('team meetings use theme-derived accent', () => {
    const map = buildEmployeeColorMap(employees, theme)
    const accent = getEventAccentColor(
      { user_id: 'aaa-uuid', category: TEAM_MEETING_CATEGORY, color: '#000' },
      map,
      theme,
    )
    expect(accent).toBe(getTeamMeetingAccentColor(theme))
    expect(accent).not.toBe(map.get('aaa-uuid'))
  })

  it('job bookings use employee colour from map', () => {
    const map = buildEmployeeColorMap(employees, theme)
    const color = getEventAccentColor({ user_id: 'aaa-uuid', category: BOOKING_CATEGORY }, map, theme)
    expect(color).toBe(map.get('aaa-uuid'))
  })

  it('card styles use tinted fill and dark text', () => {
    const map = buildEmployeeColorMap(employees, theme)
    const styles = getEventCardStyles({ user_id: 'aaa-uuid', category: BOOKING_CATEGORY }, map, theme)
    expect(styles.accent).toBe(map.get('aaa-uuid'))
    expect(styles.fill).toMatch(/^rgba\(/)
    expect(styles.text).toMatch(/^#[0-9a-f]{6}$/i)
    expect(styles.text).not.toBe(styles.accent)
  })

  it('dedupes team meetings by booking_group_id for aggregated view', () => {
    const groupId = 'group-1'
    const events = [
      { id: '1', category: TEAM_MEETING_CATEGORY, booking_group_id: groupId, user_id: 'a' },
      { id: '2', category: TEAM_MEETING_CATEGORY, booking_group_id: groupId, user_id: 'b' },
      { id: '3', category: BOOKING_CATEGORY, booking_group_id: null, user_id: 'a' },
    ]
    const deduped = dedupeTeamMeetingsForAggregatedView(events)
    expect(deduped).toHaveLength(2)
    expect(deduped.filter((e) => e.booking_group_id === groupId)).toHaveLength(1)
    expect(countTeamMeetingAttendees(events, groupId)).toBe(2)
    expect(isTeamMeetingCategory(TEAM_MEETING_CATEGORY)).toBe(true)
  })
})
