import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import AssignLeadModal from './AssignLeadModal'

interface Lead {
  id: string
  name: string
  phone: string
  email: string
  service_type: string
  details: string
  status: string
  created_at: string
  address?: string
}

interface LeadsListProps {
  onShareSocial?: (lead: Lead, photoUrl: string) => void
}

export default function LeadsList({ onShareSocial }: LeadsListProps) {
  const { profile } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  async function fetchLeads() {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('status', 'unassigned')
      .order('created_at', { ascending: false })

    if (data) setLeads(data as Lead[])
    setLoading(false)
  }

  async function handleSelfAssign(leadId: string) {
    if (!profile?.id) return

    const now = new Date()
    const timerExpiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString()

    const { error } = await supabase
      .from('leads')
      .update({
        assigned_to: profile.id,
        status: 'assigned',
        assigned_at: now.toISOString(),
        timer_expires_at: timerExpiresAt
      })
      .eq('id', leadId)

    if (error) {
      alert('Error self-assigning lead: ' + error.message)
    } else {
      fetchLeads()
    }
  }

  useEffect(() => {
    fetchLeads()

    const channel = supabase
      .channel('leads-list-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, () => fetchLeads())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, () => fetchLeads())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (loading) return <p className="text-gray-400 text-sm">Loading leads...</p>

  if (leads.length === 0) {
    return (
      <div className="bg-white shadow-sm border-y border-gray-200 sm:rounded-xl sm:border sm:mx-0 -mx-4 p-6 text-center">
        <p className="text-gray-400 text-sm">No unassigned leads yet.</p>
      </div>
    )
  }

  return (
    <>
      {selectedLead && (
        <AssignLeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onAssigned={fetchLeads}
        />
      )}

      <div className="bg-white shadow-sm border-y border-gray-200 sm:rounded-xl sm:border sm:mx-0 -mx-4">
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
            <div key={lead.id} className="p-4 flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-800 truncate">{lead.name || 'Unknown'}</p>
                <p className="text-sm text-gray-500">{lead.service_type || 'No service type'}</p>
                <p className="text-sm text-gray-400 mt-1">{lead.phone} · {lead.email}</p>
                {lead.details && (
                  <p className="text-sm text-gray-600 mt-2">{lead.details}</p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 ml-4 flex-shrink-0">
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(lead.created_at).toLocaleDateString()}
                </span>

                {profile?.role === 'manager' && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setSelectedLead(lead)}
                      className="text-xs bg-[#004B93] text-white px-2 py-1 rounded-lg hover:bg-[#003d7a] transition whitespace-nowrap"
                    >
                      Assign
                    </button>
                    <button
                      onClick={() => handleSelfAssign(lead.id)}
                      className="text-xs bg-gray-600 text-white px-2 py-1 rounded-lg hover:bg-gray-700 transition whitespace-nowrap"
                    >
                      Grab Job
                    </button>
                  </div>
                )}

                {profile?.role === 'employee' && (
                  <button
                    onClick={() => handleSelfAssign(lead.id)}
                    className="text-xs bg-[#00B4C5] text-white px-3 py-1 rounded-lg hover:bg-[#009aaa] transition whitespace-nowrap"
                  >
                    Self-Assign
                  </button>
                )}

                {onShareSocial && (
                  <button
                    onClick={() => onShareSocial(lead, 'https://placehold.co/600x400/004B93/ffffff?text=Job+Photo')}
                    className="text-xs text-purple-600 border border-purple-200 bg-purple-50 px-2 py-0.5 rounded hover:bg-purple-100 transition whitespace-nowrap"
                  >
                    📱 Test Social Post
                  </button>
                )}

                <a
                  href={`/leads?leadId=${lead.id}`}
                  className="text-xs text-[#004B93] underline whitespace-nowrap"
                >
                  View →
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}