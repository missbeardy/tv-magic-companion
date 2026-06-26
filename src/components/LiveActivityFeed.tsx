import { Link } from 'react-router-dom'
import { Radio } from 'lucide-react'
import { formatLeadEventDisplay } from '../lib/formatLeadEvent'
import { timeAgo } from '../lib/timeAgo'
import type { ActivityFeedRow } from '../hooks/useTeamActivityFeed'

interface Props {
  events: ActivityFeedRow[]
  loading?: boolean
  emptyMessage?: string
  compact?: boolean
}

export default function LiveActivityFeed({
  events,
  loading,
  emptyMessage = 'No activity in the last 24 hours',
  compact = false,
}: Props) {
  if (loading) {
    return (
      <div className="card overflow-hidden animate-pulse">
        <div className="px-5 py-4 border-b border-gray-100 h-12 bg-gray-50" />
        <div className="px-5 py-6 space-y-4">
          <div className="h-12 bg-gray-100 rounded" />
          <div className="h-12 bg-gray-100 rounded" />
          <div className="h-12 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Radio size={15} className="text-gray-400" />
        <h2 className="font-display font-semibold text-gray-800 text-base">Live Activity</h2>
      </div>
      {events.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gray-400 text-center">{emptyMessage}</p>
      ) : (
        <div className={`divide-y divide-gray-50 ${compact ? 'max-h-64 overflow-y-auto' : ''}`}>
          {events.map((event) => {
            const formatted = formatLeadEventDisplay({
              eventType: event.event_type,
              note: event.note,
              payload: event.payload,
              actorName: event.actorName,
              leadName: event.leadName,
            })
            const Icon = formatted.icon

            return (
              <Link
                key={event.id}
                to="/leads"
                className="px-5 py-3.5 flex items-start gap-3 hover:bg-gray-50 transition"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${formatted.iconColour}`}
                >
                  <Icon size={14} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug">{formatted.text}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{timeAgo(event.created_at)}</p>
                </div>
                {event.actorAvatarUrl ? (
                  <img
                    src={event.actorAvatarUrl}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                  />
                ) : event.actorName ? (
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-gray-600">
                      {event.actorName.charAt(0)}
                    </span>
                  </div>
                ) : null}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
