import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import type { TeamWorkloadRow } from '../hooks/useTeamWorkload'

interface Props {
  techs: TeamWorkloadRow[]
  loading?: boolean
}

export default function TeamWorkloadPanel({ techs, loading }: Props) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="card overflow-hidden animate-pulse">
        <div className="px-5 py-4 border-b border-gray-100 h-12 bg-gray-50" />
        <div className="px-5 py-6 space-y-3">
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  if (techs.length === 0) return null

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Users size={15} className="text-gray-400" />
        <h2 className="font-display font-semibold text-gray-800 text-base">Team Workload</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {techs.map((tech) => {
          const pipelineTotal = tech.assignedCount + tech.contactCount + tech.bookedCount
          return (
            <div
              key={tech.id}
              onClick={() => navigate(`/calendar?employee=${tech.id}`)}
              className="px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition"
            >
              <div className="w-8 h-8 rounded-full bg-[#004B93] flex items-center justify-center shrink-0 overflow-hidden">
                {tech.avatar_url ? (
                  <img src={tech.avatar_url} className="w-full h-full object-cover" alt={tech.full_name} />
                ) : (
                  <span className="text-white font-bold text-xs">{tech.full_name.charAt(0)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{tech.full_name}</p>
                <p className="text-xs text-gray-400">
                  {tech.assignedCount} Assigned · {tech.contactCount} Contact · {tech.bookedCount} Booked
                </p>
              </div>
              {pipelineTotal === 0 && <span className="badge badge-green">Free</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
