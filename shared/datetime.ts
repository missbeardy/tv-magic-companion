/** Named `Intl.DateTimeFormatOptions` presets — the shapes ad-hoc toLocaleDateString
 * calls across the app actually used, named instead of re-typed at each call site. */
export const ORG_DATE_STYLES = [
  'full',
  'long',
  'month',
  'monthYear',
  'dayMonth',
  'dayMonthYear',
  'short',
  'weekdayMonth',
  'weekdayDayMonth',
] as const

export type OrgDateStyle = (typeof ORG_DATE_STYLES)[number]

const STYLE_OPTIONS: Record<OrgDateStyle, Intl.DateTimeFormatOptions> = {
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  month: { month: 'long' },
  monthYear: { month: 'long', year: 'numeric' },
  dayMonth: { day: 'numeric', month: 'short' },
  dayMonthYear: { day: 'numeric', month: 'short', year: 'numeric' },
  short: { weekday: 'short', day: 'numeric', month: 'short' },
  weekdayMonth: { weekday: 'long', month: 'long' },
  weekdayDayMonth: { weekday: 'long', day: 'numeric', month: 'long' },
}

/**
 * Formats a date the way this app has always shown dates to a user (en-AU, no ad-hoc
 * `toLocaleDateString({...})` options object re-typed at every call site) — with an
 * optional IANA `tz` so a date can be rendered in the org's own timezone rather than
 * whichever device happens to be viewing it. Omitting `tz` keeps today's behaviour
 * (the viewer's local timezone) exactly as-is.
 */
export function formatOrgDate(d: Date, tz: string | null | undefined, style: OrgDateStyle): string {
  const options: Intl.DateTimeFormatOptions = { ...STYLE_OPTIONS[style] }
  if (tz) options.timeZone = tz
  return d.toLocaleDateString('en-AU', options)
}
