import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from './CountdownTimer'

interface Lead {
  id: string
  name: string
  phone: string
  email: string
  service_type: string
  details: string
  status: string
  assigned_at: string
  timer_expires_at: string
  assigned_to: string
  profiles: { full_name: string } | null
}

export default function AssignedLeads() {
  const { profile } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchLeads() {
    let query = supabase
      .from('leads')
      .select('*, profiles(full_name)')
      .eq('status', 'assigned')
      .order('timer_expires_at', { ascending: true })

    if (profile?.role === 'employee') {
      query = query.eq('assigned_to', profile.id)
    }

    const { data } = await query
    if (data) setLeads(data as Lead[])
    setLoading(false)
  }

  useEffect(() => {
    if (!profile) return
    fetchLeads()

    const channel = supabase
      .channel('assigned-leads-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => fetchLeads()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])

  if (loading) return <p className="text-gray-400 text-sm">Loading...</p>

  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
        <p className="text-gray-400 text-sm">No assigned leads.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800">
          Assigned Leads
          <span className="ml-2 bg-[#00B4C5] text-white text-xs px-2 py-0.5 rounded-full">
            {leads.length}
          </span>
        </h3>
      </div>

      <div className="divide-y divide-gray-100">
        {leads.map(lead => (
          <div key={lead.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-gray-800">{lead.name || 'Unknown'}</p>
                <p className="text-sm text-gray-500">{lead.service_type || 'No service type'}</p>
                <p className="text-sm text-gray-400 mt-1">{lead.phone} · {lead.email}</p>
                {lead.details && (
                  <p className="text-sm text-gray-600 mt-2">{lead.details}</p>
                )}
                {profile?.role === 'manager' && lead.profiles && (
                  <p className="text-xs text-[#004B93] mt-2 font-medium">
                    Assigned to: {lead.profiles.full_name}
                  </p>
                )}
              </div>
              <div className="ml-4 text-right">
                {lead.timer_expires_at && (
                  <CountdownTimer
                    expiresAt={lead.timer_expires_at}
                    onExpire={fetchLeads}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}