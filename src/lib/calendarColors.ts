import { darkenHex, type ThemeTokens } from './theme'

export const TEAM_MEETING_CATEGORY = 'Team Meeting'
export const BOOKING_CATEGORY = 'Booking'

const PALETTE_SIZE = 10
const CARD_FILL_ALPHA = 0.14
const CARD_TEXT_DARKEN = 0.72

type ThemeColors = Pick<ThemeTokens, 'primary' | 'secondary' | 'primaryDark'>

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return null
  const num = parseInt(normalized, 16)
  if (Number.isNaN(num)) return null
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff }
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const rgb = parseHex(hex)
  if (!rgb) return { h: 210, s: 100, l: 29 }

  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l: l * 100 }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return { h: h * 360, s: s * 100, l: l * 100 }
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360
  const ss = Math.max(0, Math.min(100, s)) / 100
  const ll = Math.max(0, Math.min(100, l)) / 100

  if (ss === 0) {
    const v = Math.round(ll * 255)
    return `#${[v, v, v].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }

  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q
  const r = hue2rgb(p, q, hh / 360 + 1 / 3)
  const g = hue2rgb(p, q, hh / 360)
  const b = hue2rgb(p, q, hh / 360 - 1 / 3)

  return `#${[r, g, b]
    .map((c) => Math.round(c * 255).toString(16).padStart(2, '0'))
    .join('')}`
}

/** Distinguishable hues derived from org primary/secondary. */
export function buildEmployeePalette(theme: Pick<ThemeTokens, 'primary' | 'secondary'>): string[] {
  const primaryHsl = hexToHsl(theme.primary)
  const secondaryHsl = hexToHsl(theme.secondary)
  const palette: string[] = [theme.primary, theme.secondary]

  const hueOffsets = [25, 50, 85, 120, 155, 190, 225, 260]
  for (const offset of hueOffsets) {
    if (palette.length >= PALETTE_SIZE) break
    const h = (primaryHsl.h + offset) % 360
    const s = Math.min(Math.max(primaryHsl.s, 45), 75)
    const l = Math.min(Math.max(primaryHsl.l, 32), 48)
    palette.push(hslToHex(h, s, l))
  }

  if (palette.length < PALETTE_SIZE) {
    palette.push(hslToHex((secondaryHsl.h + 180) % 360, secondaryHsl.s, secondaryHsl.l))
  }

  return palette.slice(0, PALETTE_SIZE)
}

export function buildEmployeeColorMap(
  employees: { id: string }[],
  theme: Pick<ThemeTokens, 'primary' | 'secondary'>,
): Map<string, string> {
  const palette = buildEmployeePalette(theme)
  const sorted = [...employees].sort((a, b) => a.id.localeCompare(b.id))
  const map = new Map<string, string>()
  sorted.forEach((emp, index) => {
    map.set(emp.id, palette[index % palette.length])
  })
  return map
}

export function getEmployeeColor(
  userId: string,
  employees: { id: string }[],
  theme: Pick<ThemeTokens, 'primary' | 'secondary'>,
): string {
  return buildEmployeeColorMap(employees, theme).get(userId) ?? theme.primary
}

export function getTeamMeetingAccentColor(theme: Pick<ThemeTokens, 'primary' | 'secondary'>): string {
  const secondary = hexToHsl(theme.secondary)
  return hslToHex((secondary.h + 250) % 360, Math.max(secondary.s, 50), 42)
}

export function getLeaveAccentColor(theme: Pick<ThemeTokens, 'primaryDark'>): string {
  return darkenHex(theme.primaryDark, 0.35)
}

export function getEventAccentColor(
  event: { user_id: string; category?: string | null; color?: string | null },
  colorMap: Map<string, string>,
  theme: ThemeColors,
): string {
  if (event.category === TEAM_MEETING_CATEGORY) return getTeamMeetingAccentColor(theme)
  if (event.category === 'Leave') return event.color ?? getLeaveAccentColor(theme)
  return colorMap.get(event.user_id) ?? event.color ?? theme.primary
}

/** @deprecated Use getEventAccentColor — kept for call sites that only need accent hue. */
export function getEventDisplayColor(
  event: { user_id: string; category?: string | null; color?: string | null },
  colorMap: Map<string, string>,
  theme: ThemeColors,
): string {
  return getEventAccentColor(event, colorMap, theme)
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

export interface EventCardStyles {
  accent: string
  fill: string
  text: string
}

export function getEventCardStyles(
  event: { user_id: string; category?: string | null; color?: string | null },
  colorMap: Map<string, string>,
  theme: ThemeColors,
): EventCardStyles {
  const accent = getEventAccentColor(event, colorMap, theme)
  return {
    accent,
    fill: hexToRgba(accent, CARD_FILL_ALPHA),
    text: darkenHex(accent, CARD_TEXT_DARKEN),
  }
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
