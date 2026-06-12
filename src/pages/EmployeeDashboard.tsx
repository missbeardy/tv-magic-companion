// src/pages/EmployeeDashboard.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import AssignedLeads from '../components/AssignedLeads'
import { useTechLocation } from '../hooks/useTechLocation'
import { Inbox, ClipboardCheck, Clock, Zap } from 'lucide-react'

interface Stats {
  assigned: number
  completed: number
  unassigned: number
}

function StatCard({ label, value, icon: Icon, colour }: {
  label: string
  value: number
  icon: React.ElementType
  colour: string
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
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
  const [stats, setStats] = useState<Stats>({ assigned: 0, completed: 0, unassigned: 0 })
  useTechLocation()

  async function fetchStats() {
    if (!profile) return
    const { data } = await supabase
      .from('leads')
      .select('status, assigned_to')
      .eq('org_id', profile.org_id)

    if (data) {
      setStats({
        assigned:   data.filter(l => l.status === 'assigned'  && l.assigned_to === profile.id).length,
        completed:  data.filter(l => l.status === 'completed' && l.assigned_to === profile.id).length,
        unassigned: data.filter(l => l.status === 'unassigned').length,
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
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* Welcome */}
      <div>
        <h1 className="font-display font-bold text-gray-900 text-xl">
          Hey {profile?.full_name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Here's your workload for today</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="My Jobs"       value={stats.assigned}   icon={Clock}          colour="bg-[#004B93]" />
        <StatCard label="Completed"     value={stats.completed}  icon={ClipboardCheck} colour="bg-green-500" />
        <StatCard label="In Pool"       value={stats.unassigned} icon={Inbox}          colour="bg-amber-400" />
      </div>

      {/* Unassigned pool nudge */}
      {stats.unassigned > 0 && (
        <div className="flex items-center gap-3 bg-[#004B93]/5 border border-[#004B93]/15 rounded-xl px-4 py-3">
          <Zap size={15} className="text-[#004B93] shrink-0" />
          <p className="text-sm text-[#004B93] font-medium">
            {stats.unassigned} lead{stats.unassigned !== 1 ? 's' : ''} in the pool — head to Leads to pick one up
          </p>
        </div>
      )}

      {/* Assigned leads */}
      <AssignedLeads />
    </div>
  )
}