import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Lead {
  id: string
  name: string
  phone: string
  email: string
  service_type: string
  details: string
  status: string
  created_at: string
}

export default function LeadsList() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchLeads() {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('status', 'unassigned')
      .order('created_at', { ascending: false })

    if (data) setLeads(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchLeads()

    const channel = supabase
      .channel('leads-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => fetchLeads()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (loading) return <p className="text-gray-400 text-sm">Loading leads...</p>

  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
        <p className="text-gray-400 text-sm">No unassigned leads yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800">
          Unassigned Leads
          <span className="ml-2 bg-[#004B93] text-white text-xs px-2 py-0.5 rounded-full">
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
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                {new Date(lead.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}