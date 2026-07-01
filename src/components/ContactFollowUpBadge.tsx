import { useEffect, useState } from 'react'
import { getContactFollowUpState } from '../lib/contactFollowUp'

interface Props {
  lastAttemptAt: string | null | undefined
}

export default function ContactFollowUpBadge({ lastAttemptAt }: Props) {
  const [elapsed, setElapsed] = useState(() => getContactFollowUpState(lastAttemptAt).label)

  useEffect(() => {
    const tick = () => setElapsed(getContactFollowUpState(lastAttemptAt).label)
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [lastAttemptAt])

  return (
    <span className="inline-flex items-center text-xs rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
      {elapsed} since attempt
    </span>
  )
}
