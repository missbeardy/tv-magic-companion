import { useNow } from '../hooks/useNow'

function formatElapsed(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  return `${Math.max(minutes, 0)}m`
}

interface Props {
  createdAt: string
}

export default function UnassignedTimer({ createdAt }: Props) {
  const now = useNow()
  const label = formatElapsed(now - new Date(createdAt).getTime())

  return (
    <span className="inline-flex items-center text-xs rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
      {label}
    </span>
  )
}
