export const TEAM_MEETING_COLOR = '#7C3AED'
export const TEAM_MEETING_CATEGORY = 'Team Meeting'
export const BOOKING_CATEGORY = 'Booking'

/** Distinguishable hues for per-employee calendar blocks (manager view). */
export const EMPLOYEE_PALETTE = [
  '#004B93',
  '#00B4C5',
  '#E67E22',
  '#E91E63',
  '#2E7D32',
  '#F59E0B',
  '#6366F1',
  '#DB2777',
  '#0891B2',
  '#65A30D',
] as const

export function buildEmployeeColorMap(employees: { id: string }[]): Map<string, string> {
  const sorted = [...employees].sort((a, b) => a.id.localeCompare(b.id))
  const map = new Map<string, string>()
  sorted.forEach((emp, index) => {
    map.set(emp.id, EMPLOYEE_PALETTE[index % EMPLOYEE_PALETTE.length])
  })
  return map
}

export function getEmployeeColor(userId: string, employees: { id: string }[]): string {
  return buildEmployeeColorMap(employees).get(userId) ?? EMPLOYEE_PALETTE[0]
}

export function getEventDisplayColor(
  event: { user_id: string; category?: string | null; color?: string | null },
  colorMap: Map<string, string>,
  fallback = '#004B93',
): string {
  if (event.category === TEAM_MEETING_CATEGORY) return TEAM_MEETING_COLOR
  if (event.category === 'Leave') return event.color ?? '#111827'
  return colorMap.get(event.user_id) ?? event.color ?? fallback
}

export function isTeamMeetingCategory(category?: string | null): boolean {
  return category === TEAM_MEETING_CATEGORY
}

/** One purple block per team meeting when a manager views all employees at once. */
export function dedupeTeamMeetingsForAggregatedView<
  T extends { id: string; category?: string | null; booking_group_id?: string | null },
>(events: T[]): T[] {
  const seenGroups = new Set<string>()
  return events.filter((event) => {
    if (!isTeamMeetingCategory(event.category) || !event.booking_group_id) return true
    if (seenGroups.has(event.booking_group_id)) return false
    seenGroups.add(event.booking_group_id)
    return true
  })
}

export function countTeamMeetingAttendees<
  T extends { booking_group_id?: string | null },
>(events: T[], bookingGroupId: string): number {
  return events.filter((e) => e.booking_group_id === bookingGroupId).length
}
