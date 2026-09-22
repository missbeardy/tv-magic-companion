import { formatOrgDate, type OrgDateStyle } from '../../shared/datetime'

interface Props {
  date: Date
  style: OrgDateStyle
  tz?: string | null
  className?: string
}

/** A formatted date, styled as inline text — the JSX-facing counterpart to
 * formatOrgDate for the (common) case of just rendering a date directly. */
export default function DatePill({ date, style, tz, className }: Props) {
  return <span className={className}>{formatOrgDate(date, tz, style)}</span>
}
