// src/pages/ManagerDashboard.tsx
// Last updated: 17 June 2026 - removed duplicate date pill

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useOrgProfiles } from '../hooks/useOrgProfiles'
import NavBar from '../components/NavBar'
import AssignedLeads from '../components/AssignedLeads'
import RevenueWidget from '../components/RevenueWidget'
import { useTechLocation } from '../hooks/useTechLocation'
import {
  Users, Inbox, ClipboardCheck, Clock, TrendingUp, AlertCircle
} from 'lucide-react'

interface StatsRow {
  unassigned: number
  assigned: number
  completed: number
  contact_attempted: number
}

interface TechRow {
  id: string
  full_name: string
  avatar_url?: string
  activeCount: number
}

function StatCard({ label, value, icon: Icon, colour, onClick }: {
  label: string
  value: number
  icon: React.ElementType
  colour: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`card p-4 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-all' : ''}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colour}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="font-display font-bold text-2xl text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5 font-medium">{label}</p>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

export default function ManagerDashboard() {
  const { profile } = useAuth()
  const { fetchOrgProfiles } = useOrgProfiles()
  const navigate = useNavigate()
  const [stats, setStats] = useState<StatsRow>({ unassigned: 0, assigned: 0, completed: 0, contact_attempted: 0 })
  const [techs, setTechs] = useState<TechRow[]>([])
  const [loading, setLoading] = useState(true)
  useTechLocation(profile?.id ?? null)

  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  async function fetchData() {
    if (!profile) return

    const { data: leads } = await supabase
      .from('leads')
      .select('status, assigned_to')
      .eq('org_id', profile.org_id)

    if (leads) {
      const s = { unassigned: 0, assigned: 0, completed: 0, contact_attempted: 0 }
      leads.forEach(l => {
        if (l.status in s) s[l.status as keyof StatsRow]++
      })
      setStats(s)

      const countMap: Record<string, number> = {}
      leads.filter(l => l.status === 'assigned').forEach(l => {
        if (l.assigned_to) countMap[l.assigned_to] = (countMap[l.assigned_to] ?? 0) + 1
      })

      const profiles = await fetchOrgProfiles({ roles: ['employee', 'manager'] })
      setTechs(profiles.map((p) => ({ ...p, activeCount: countMap[p.id] ?? 0 })))
    }

    setLoading(false)
  }

  useEffect(() => {
    if (!profile) return
    fetchData()
    const channel = supabase
      .channel('manager-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile])

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome + Date — pill badge removed (was duplicate) */}
        <div>
          <h1 className="font-display font-bold text-gray-900 text-xl">
            Good {getGreeting()}, {profile?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>

        {/* Unassigned alert */}
        {stats.unassigned > 0 && (
          <div
            onClick={() => navigate('/leads?status=unassigned')}
            className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-amber-100 transition"
          >
            <AlertCircle size={16} className="text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700 font-medium">
              {stats.unassigned} unassigned lead{stats.unassigned !== 1 ? 's' : ''} waiting for action
            </p>
          </div>
        )}

        {/* Stats row - clickable */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Unassigned" value={stats.unassigned} icon={Inbox} colour="bg-amber-400"
            onClick={() => navigate('/leads?status=unassigned')}
          />
          <StatCard
            label="Assigned" value={stats.assigned} icon={Clock} colour="bg-[#004B93]"
            onClick={() => navigate('/leads?status=assigned')}
          />
          <StatCard
            label="Completed" value={stats.completed} icon={ClipboardCheck} colour="bg-green-500"
            onClick={() => navigate('/leads?status=completed')}
          />
          <StatCard
            label="Attempted" value={stats.contact_attempted} icon={TrendingUp} colour="bg-[#00B4C5]"
            onClick={() => navigate('/leads?status=contact_attempted')}
          />
        </div>

        {/* Team workload - clickable rows */}
        {!loading && techs.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Users size={15} className="text-gray-400" />
              <h2 className="font-display font-semibold text-gray-800 text-base">Team Workload</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {techs.map(tech => (
                <div
                  key={tech.id}
                  onClick={() => navigate(`/calendar?employee=${tech.id}`)}
                  className="px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition"
                >
                  <div className="w-8 h-8 rounded-full bg-[#004B93] flex items-center justify-center shrink-0 overflow-hidden">
                    {tech.avatar_url
                      ? <img src={tech.avatar_url} className="w-full h-full object-cover" alt={tech.full_name} />
                      : <span className="text-white font-bold text-xs">{tech.full_name.charAt(0)}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{tech.full_name}</p>
                    <p className="text-xs text-gray-400">{tech.activeCount} active job{tech.activeCount !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(tech.activeCount, 5) }).map((_, i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-[#004B93]" />
                    ))}
                    {tech.activeCount === 0 && (
                      <span className="badge badge-green">Free</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assigned leads + revenue */}
        <div className="grid md:grid-cols-2 gap-4">
          <AssignedLeads />
          <RevenueWidget />
        </div>
      </main>
    </div>
  )
}