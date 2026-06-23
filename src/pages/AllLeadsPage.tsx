import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import NavBar from '../components/NavBar'
import CountdownTimer from '../components/CountdownTimer'

interface Lead {
  id: string
  name: string
  phone: string
  email: string
  service_type: string
  details: string
  status: string
  created_at: string
  assigned_at: string | null
  timer_expires_at: string | null
  profiles: { full_name: string } | null
}

const STATUS_COLOURS: Record<string, string> = {
  unassigned: 'bg-gray-100 text-gray-600',
  assigned: 'bg-blue-100 text-blue-700',
  expired: 'bg-red-100 text-red-600',
}

export default function AllLeadsPage() {
  const { profile } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  async function fetchLeads() {
    if (!profile?.org_id) return

    let query = supabase
      .from('leads')
      .select('*, profiles(full_name)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data } = await query
    if (data) setLeads(data as Lead[])
    setLoading(false)
  }

  useEffect(() => {
    fetchLeads()

    const channel = supabase
      .channel('all-leads-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => fetchLeads()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [filter, profile?.org_id])

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">All Leads</h2>
            <p className="text-gray-500 text-sm">Full view of every lead and its current status.</p>
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {['all', 'unassigned', 'assigned', 'expired'].map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 text-sm capitalize transition ${filter === s ? 'bg-[#004B93] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="text-gray-400 text-sm">Loading leads...</p>}

        {!loading && leads.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-gray-400 text-sm">No leads found.</p>
          </div>
        )}

        {!loading && leads.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
            {leads.map(lead => (
              <div key={lead.id} className="p-4 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-gray-800">{lead.name || 'Unknown'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOURS[lead.status]}`}>
                      {lead.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{lead.service_type || 'No service type'}</p>
                  <p className="text-sm text-gray-400 mt-1">{lead.phone} · {lead.email}</p>
                  {lead.details && (
                    <p className="text-sm text-gray-600 mt-1">{lead.details}</p>
                  )}
                  {lead.profiles && (
                    <p className="text-xs text-[#004B93] mt-2 font-medium">
                      Assigned to: {lead.profiles.full_name}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">
                    {new Date(lead.created_at).toLocaleDateString('en-AU')}
                  </p>
                  {lead.timer_expires_at && lead.status === 'assigned' && (
                    <div className="mt-1">
                      <CountdownTimer expiresAt={lead.timer_expires_at} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}