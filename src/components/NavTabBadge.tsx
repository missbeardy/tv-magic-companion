export function formatNavBadgeCount(count: number): string | null {
  if (count <= 0) return null
  return count > 9 ? '9+' : String(count)
}

interface Props {
  count: number
}

export default function NavTabBadge({ count }: Props) {
  const display = formatNavBadgeCount(count)
  if (!display) return null

  return (
    <span
      key={count}
      className="nav-tab-badge nav-badge-pulse"
      aria-hidden="true"
    >
      {display}
    </span>
  )
}
