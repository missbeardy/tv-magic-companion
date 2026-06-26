import { describe, expect, it } from 'vitest'
import {
  BOOKING_CATEGORY,
  TEAM_MEETING_CATEGORY,
  TEAM_MEETING_COLOR,
  buildEmployeeColorMap,
  countTeamMeetingAttendees,
  dedupeTeamMeetingsForAggregatedView,
  getEmployeeColor,
  getEventDisplayColor,
  isTeamMeetingCategory,
} from '../src/lib/calendarColors'

describe('calendarColors', () => {
  const employees = [
    { id: 'bbb-uuid', full_name: 'Bob' },
    { id: 'aaa-uuid', full_name: 'Alice' },
  ]

  it('assigns stable colours sorted by id', () => {
    const map = buildEmployeeColorMap(employees)
    expect(map.get('aaa-uuid')).toBe(getEmployeeColor('aaa-uuid', employees))
    expect(map.get('bbb-uuid')).toBe(getEmployeeColor('bbb-uuid', employees))
    expect(map.get('aaa-uuid')).not.toBe(map.get('bbb-uuid'))
  })

  it('team meetings are always purple', () => {
    const map = buildEmployeeColorMap(employees)
    expect(
      getEventDisplayColor(
        { user_id: 'aaa-uuid', category: TEAM_MEETING_CATEGORY, color: '#000' },
        map,
      ),
    ).toBe(TEAM_MEETING_COLOR)
  })

  it('job bookings use employee colour from map', () => {
    const map = buildEmployeeColorMap(employees)
    const color = getEventDisplayColor(
      { user_id: 'aaa-uuid', category: BOOKING_CATEGORY },
      map,
    )
    expect(color).toBe(map.get('aaa-uuid'))
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
  })
})
