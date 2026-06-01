import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import NavBar from '../components/NavBar'
import CountdownTimer from '../components/CountdownTimer'
import LeadStatusMenu from '../components/LeadStatusMenu'
import LeadPhotos from '../components/LeadPhotos'
import AssignLeadModal from '../components/AssignLeadModal'
import EventModal from '../components/EventModal'
import DemoToggle from '../components/DemoToggle'

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
  assigned_to: string | null
  profiles: { full_name: string } | null
}

const COLUMNS = [
  { key: 'unassigned', label: 'Unassigned', color: 'border-gray-300', badge: 'bg-gray-100 text-gray-600' },
  { key: 'assigned', label: 'Assigned', color: 'border-blue-300', badge: 'bg-blue-100 text-blue-700' },
  { key: 'won', label: 'Won', color: 'border-green-300', badge: 'bg-green-100 text-green-700' },
  { key: 'lost', label: 'Lost', color: 'border-red-300', badge: 'bg-red-100 text-red-600' },
  { key: 'completed', label: 'Completed', color: 'border-purple-300', badge: 'bg-purple-100 text-purple-700' },
]

export default function LeadsPage() {
  const { profile } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [assigningLead, setAssigningLead] = useState<Lead | null>(null)
  const [bookingLead, setBookingLead] = useState<Lead | null>(null)
  const [expandedLead, setExpandedLead] = useState<string | null>(null)

  async function fetchLeads() {
    let query = supabase
      .from('leads')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })

    if (profile?.role === 'employee') {
      query = query.or(`status.eq.unassigned,assigned_to.eq.${profile.id}`)
    }

    const { data } = await query
    if (data) setLeads(data as Lead[])
    setLoading(false)
  }

  useEffect(() => {
    if (!profile) return
    fetchLeads()

    const channel = supabase
      .channel('leads-page-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchLeads)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])

  function leadsForColumn(status: string) {
    return leads.filter(l => l.status === status)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {assigningLead && (
        <AssignLeadModal
          lead={assigningLead}
          onClose={() => setAssigningLead(null)}
          onAssigned={fetchLeads}
        />
      )}
      {bookingLead && (
        <EventModal
          prefillLead={{
            id: bookingLead.id,
            name: bookingLead.name,
            phone: bookingLead.phone,
            email: bookingLead.email,
            details: bookingLead.details,
            service_type: bookingLead.service_type,
          }}
          onClose={() => setBookingLead(null)}
          onSaved={fetchLeads}
        />
      )}

      <NavBar />

      <main className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Leads</h2>
            <p className="text-gray-500 text-sm">Manage and track all leads across every stage.</p>
          </div>
          {profile?.role === 'manager' && <DemoToggle />}
        </div>

        {loading && <p className="text-gray-400 text-sm">Loading leads...</p>}

        {!loading && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map(col => {
              const colLeads = leadsForColumn(col.key)
              return (
                <div
                  key={col.key}
                  className={`flex-shrink-0 w-72 bg-white rounded-xl border-t-4 ${col.color} shadow-sm border border-gray-200`}
                >
                  <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-semibold text-gray-700 text-sm">{col.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badge}`}>
                      {colLeads.length}
                    </span>
                  </div>

                  <div className="p-2 space-y-2 max-h-screen overflow-y-auto">
                    {colLeads.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">No leads</p>
                    )}

                    {colLeads.map(lead => {
                      const isExpanded = expandedLead === lead.id
                      return (
                        <div
                          key={lead.id}
                          className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-800 text-sm truncate">{lead.name || 'Unknown'}</p>
                              <p className="text-xs text-gray-500 truncate">{lead.service_type}</p>
                            </div>
                            <LeadStatusMenu
                              leadId={lead.id}
                              currentStatus={lead.status}
                              onUpdated={fetchLeads}
                            />
                          </div>

                          {lead.timer_expires_at && lead.status === 'assigned' && (
                            <div className="mt-2">
                              <CountdownTimer expiresAt={lead.timer_expires_at} onExpire={fetchLeads} />
                            </div>
                          )}

                          {lead.profiles && (
                            <p className="text-xs text-[#004B93] mt-1 font-medium">
                              → {lead.profiles.full_name}
                            </p>
                          )}

                          <button
                            onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                            className="text-xs text-gray-400 hover:text-gray-600 mt-2 transition"
                          >
                            {isExpanded ? '▲ Less' : '▼ More'}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
                              <p className="text-xs text-gray-600">{lead.phone}</p>
                              <p className="text-xs text-gray-600">{lead.email}</p>
                              {lead.details && (
                                <p className="text-xs text-gray-500">{lead.details}</p>
                              )}

                              <div className="flex flex-wrap gap-1 mt-2">
                                {lead.status === 'unassigned' && profile?.role === 'manager' && (
                                  <button
                                    onClick={() => setAssigningLead(lead)}
                                    className="text-xs bg-[#004B93] text-white px-2 py-1 rounded-lg hover:bg-[#003d7a] transition"
                                  >
                                    Assign
                                  </button>
                                )}
                                {lead.status === 'unassigned' && profile?.role === 'employee' && (
                                  <button
                                    onClick={() => setAssigningLead(lead)}
                                    className="text-xs bg-[#00B4C5] text-white px-2 py-1 rounded-lg hover:bg-[#009aaa] transition"
                                  >
                                    Self-Assign
                                  </button>
                                )}
                                <button
                                  onClick={() => setBookingLead(lead)}
                                  className="text-xs bg-[#00B4C5] text-white px-2 py-1 rounded-lg hover:bg-[#009aaa] transition"
                                >
                                  📅 Book
                                </button>
                              </div>

                              {lead.status === 'completed' && (
                                <LeadPhotos leadId={lead.id} canUpload={true} />
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}