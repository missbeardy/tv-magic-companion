// src/components/CountdownTimer.tsx
import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface Props {
  expiresAt: string
  onExpire?: () => void
  /** Show pool-return copy next to the timer (assigned leads). */
  showPoolHint?: boolean
}

function getTimeLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return null
  const totalSeconds = Math.floor(diff / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return { h, m, s, totalSeconds }
}

export default function CountdownTimer({ expiresAt, onExpire, showPoolHint = false }: Props) {
  const [time, setTime] = useState(() => getTimeLeft(expiresAt))

  useEffect(() => {
    const interval = setInterval(() => {
      const t = getTimeLeft(expiresAt)
      setTime(t)
      if (!t) {
        clearInterval(interval)
        onExpire?.()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt, onExpire])

  if (!time) {
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 border border-red-200 w-fit">
          <Clock size={11} className="text-red-500" />
          <span className="text-red-600 font-bold text-xs font-display">Expired</span>
        </div>
        {showPoolHint && (
          <p className="text-[10px] text-red-600/90 font-medium leading-tight">Expired — back in pool</p>
        )}
      </div>
    )
  }

  // Colour states: ≥2h green, 1h–2h amber, <1h red
  const isUrgent = time.totalSeconds < 3600 // under 1 hour
  const isWarning = time.totalSeconds < 2 * 3600 // under 2 hours
  const colourSet = isUrgent
    ? { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', icon: 'text-red-400' }
    : isWarning
      ? { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-400' }
      : { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-400' }

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
      {showPoolHint && (
        <p className="text-[10px] text-gray-500 font-medium leading-tight">Respond or it returns to the pool</p>
      )}
    </div>
  )
}
