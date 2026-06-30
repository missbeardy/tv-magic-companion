import { useEffect, useState } from 'react'

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
  const [label, setLabel] = useState(() =>
    formatElapsed(Date.now() - new Date(createdAt).getTime())
  )

  useEffect(() => {
    const tick = () => {
      setLabel(formatElapsed(Date.now() - new Date(createdAt).getTime()))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [createdAt])

  return (
    <span className="inline-flex items-center text-xs rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
      {label}
    </span>
  )
}
