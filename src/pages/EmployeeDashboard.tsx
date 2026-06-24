// src/pages/EmployeeDashboard.tsx
// Last updated: 17 June 2026 - removed duplicate date pill

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import NavBar from '../components/NavBar'
import AssignedLeads from '../components/AssignedLeads'
import { useTechLocation } from '../hooks/useTechLocation'
import { Inbox, CalendarDays, Zap } from 'lucide-react'

interface Stats {
  booked: number
  unassigned: number
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
      className={`card p-4 flex items-center gap-3 ${onClick ? 'cursor-pointer hover:shadow-md transition-all' : ''}`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colour}`}>
        <Icon size={16} className="text-white" />
      </div>
      <div>
        <p className="font-display font-bold text-xl text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default function EmployeeDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({ booked: 0, unassigned: 0 })
  useTechLocation(profile?.id ?? null)

  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  async function fetchStats() {
    if (!profile) return
    const { data } = await supabase
      .from('leads')
      .select('status, assigned_to')
      .eq('org_id', profile.org_id)

    if (data) {
      setStats({
        unassigned: data.filter(l => l.status === 'unassigned').length,
        booked: data.filter(l => l.status === 'booked' && l.assigned_to === profile.id).length,
      })
    }
  }

  useEffect(() => {
    if (!profile) return
    fetchStats()
    const channel = supabase
      .channel('employee-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchStats)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile])

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome + Date — pill badge removed (was duplicate) */}
        <div>
          <h1 className="font-display font-bold text-gray-900 text-xl">
            Hey {profile?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>

        {/* Stats row - clickable */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="In Pool" value={stats.unassigned} icon={Inbox} colour="bg-amber-400"
            onClick={() => navigate('/leads?status=unassigned')}
          />
          <StatCard
            label="Booked" value={stats.booked} icon={CalendarDays} colour="bg-indigo-500"
            onClick={() => navigate('/leads?status=booked')}
          />
        </div>

        {/* Unassigned pool nudge */}
        {stats.unassigned > 0 && (
          <div
            onClick={() => navigate('/leads?status=unassigned')}
            className="flex items-center gap-3 bg-[#004B93]/5 border border-[#004B93]/15 rounded-xl px-4 py-3 cursor-pointer hover:bg-[#004B93]/10 transition"
          >
            <Zap size={15} className="text-[#004B93] shrink-0" />
            <p className="text-sm text-[#004B93] font-medium">
              {stats.unassigned} lead{stats.unassigned !== 1 ? 's' : ''} in the pool — tap to pick one up
            </p>
          </div>
        )}

        <AssignedLeads />
      </main>
    </div>
  )
}