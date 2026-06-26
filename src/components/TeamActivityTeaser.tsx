import { Link } from 'react-router-dom'
import { ChevronRight, Radio } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTeamActivityFeed } from '../hooks/useTeamActivityFeed'
import { formatLeadEventDisplay } from '../lib/formatLeadEvent'
import { timeAgo } from '../lib/timeAgo'

const TEASER_COUNT = 3

export default function TeamActivityTeaser() {
  const { profile } = useAuth()
  const { events, loading } = useTeamActivityFeed(profile?.org_id, profile?.id)
  const preview = events.slice(0, TEASER_COUNT)

  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
        <div className="space-y-2">
          <div className="h-8 bg-gray-100 rounded" />
          <div className="h-8 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio size={15} className="text-gray-400" />
          <h2 className="font-display font-semibold text-gray-800 text-sm">Team Activity</h2>
        </div>
        <Link
          to="/activity"
          className="text-xs font-medium text-[#004B93] flex items-center gap-0.5 hover:underline"
        >
          View all
          <ChevronRight size={14} />
        </Link>
      </div>
      {preview.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400">No recent team activity</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {preview.map((event) => {
            const formatted = formatLeadEventDisplay({
              eventType: event.event_type,
              note: event.note,
              payload: event.payload,
              actorName: event.actorName,
              leadName: event.leadName,
            })
            return (
              <Link
                key={event.id}
                to="/activity"
                className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{formatted.text}</p>
                  <p className="text-xs text-gray-400">{timeAgo(event.created_at)}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
