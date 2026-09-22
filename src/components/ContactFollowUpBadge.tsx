import { useNow } from '../hooks/useNow'
import { getContactFollowUpState } from '../lib/contactFollowUp'

interface Props {
  lastAttemptAt: string | null | undefined
}

export default function ContactFollowUpBadge({ lastAttemptAt }: Props) {
  // Re-render on the shared tick; getContactFollowUpState reads Date.now() itself.
  useNow()
  const elapsed = getContactFollowUpState(lastAttemptAt).label

  return (
    <span className="inline-flex items-center text-xs rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
      {elapsed} since attempt
    </span>
  )
}
