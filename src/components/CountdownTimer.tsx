// src/components/CountdownTimer.tsx
import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface Props {
  /** When the lead was assigned — pill shows elapsed "time assigned". */
  assignedAt: string
  /** Show "Time assigned" label under the pill. */
  showHint?: boolean
}

const HOUR_MS = 60 * 60 * 1000

function getElapsed(assignedAt: string) {
  const diff = Date.now() - new Date(assignedAt).getTime()
  const totalMs = Math.max(0, diff)
  const totalSeconds = Math.floor(totalMs / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return { h, m, s, totalMs, totalSeconds }
}

function colourForElapsed(totalMs: number) {
  // Green 0–2h, amber 2–4h, red 4h+
  if (totalMs >= 4 * HOUR_MS) {
    return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', icon: 'text-red-400' }
  }
  if (totalMs >= 2 * HOUR_MS) {
    return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-400' }
  }
  return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-400' }
}

export default function CountdownTimer({ assignedAt, showHint = false }: Props) {
  const [time, setTime] = useState(() => getElapsed(assignedAt))

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(getElapsed(assignedAt))
    }, 1000)
    return () => clearInterval(interval)
  }, [assignedAt])

  const colourSet = colourForElapsed(time.totalMs)

  const display =
    time.h > 0
      ? `${time.h}h ${String(time.m).padStart(2, '0')}m`
      : `${String(time.m).padStart(2, '0')}m ${String(time.s).padStart(2, '0')}s`

  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border w-fit ${colourSet.bg} ${colourSet.border}`}
      >
        <Clock size={11} className={colourSet.icon} />
        <span className={`font-bold text-xs font-display tabular-nums ${colourSet.text}`}>{display}</span>
      </div>
      {showHint && (
        <p className="text-[10px] text-gray-500 font-medium leading-tight">Time assigned</p>
      )}
    </div>
  )
}
