import { useEffect, useState } from 'react'
import { getTimeRemaining } from '../lib/timer'

interface Props {
  expiresAt: string
  onExpire?: () => void
}

export default function CountdownTimer({ expiresAt, onExpire }: Props) {
  const [timeLeft, setTimeLeft] = useState(getTimeRemaining(expiresAt))

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getTimeRemaining(expiresAt)
      setTimeLeft(remaining)
      if (remaining.expired && onExpire) {
        onExpire()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [expiresAt, onExpire])

  if (timeLeft.expired) {
    return (
      <span className="text-red-500 text-sm font-medium">Expired</span>
    )
  }

  const isLow = timeLeft.total < 2 * 60 * 60 * 1000

  return (
    <div className={`text-sm font-mono font-medium ${isLow ? 'text-red-500' : 'text-green-600'}`}>
      {timeLeft.hours > 0 && `${String(timeLeft.hours).padStart(2, '0')}:`}
      {String(timeLeft.minutes).padStart(2, '0')}:
      {String(timeLeft.seconds).padStart(2, '0')}
      {isLow && <span className="ml-1 text-xs">⚠️ Running low</span>}
    </div>
  )
}