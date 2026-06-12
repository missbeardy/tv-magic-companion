// src/components/LeadsList.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from './CountdownTimer'
import AssignLeadModal from './AssignLeadModal'
import { MapPin, Phone, Mail, UserPlus, CheckCircle, Clock, Inbox } from 'lucide-react'

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
  address?: string
  profiles: { full_name: string } | null
}

function LeadSkeleton() {
  return (
    <div className="p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-100 rounded-lg w-36" />
          <div className="h-3 bg-gray-100 rounded-lg w-24" />
          <div className="h-3 bg-gray-100 rounded-lg w-48" />
        </div>
        <div className="h-8 bg-gray-100 rounded-lg w-16 shrink-0" />
      </div>
    </div>
  )
}

function statusBadge(status: string) {
  switch (status) {
    case 'assigned':  return <span className="badge badge-blue">Assigned</span>
    case 'completed': return <span className="badge badge-green">Completed</span>
    case 'contact_attempted': return <span className="badge badge-amber">Attempted</span>
    default:          return <span className="badge badge-grey">Unassigned</span>
  }
}

export default function LeadsList() {
  const { profile } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [assigningLead, setAssigningLead] = useState<Lead | null>(null)

  async function fetchLeads() {
    if (!profile) return
    const { data } = await supabase
      .from('leads')
      .select('*, profiles(full_name)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
    if (data) setLeads(data as Lead[])
    setLoading(false)
  }

  useEffect(() => {
    if (!profile) return
    fetchLeads()
    const channel = supabase
      .channel('leads-list-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchLeads())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile])

  if (loading) {
    return (
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-100 rounded-lg w-32 animate-pulse" />
        </div>
        <div className="divide-y divide-gray-50">
          <LeadSkeleton /><LeadSkeleton /><LeadSkeleton />
        </div>
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
          <Inbox size={20} className="text-gray-300" />
        </div>
        <p className="text-gray-400 text-sm font-medium">No leads yet</p>
        <p className="text-gray-300 text-xs mt-1">Leads will appear here when they come in</p>
      </div>
    )
  }

  return (
    <>
      {assigningLead && (
        <AssignLeadModal
          lead={assigningLead}
          onClose={() => setAssigningLead(null)}
          onAssigned={() => { setAssigningLead(null); fetchLeads() }}
        />
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-display font-semibold text-gray-800 text-base">All Leads</h3>
          <span className="badge badge-blue">{leads.length}</span>
        </div>

        <div className="divide-y divide-gray-50">
          {leads.map(lead => (
            <div key={lead.id} className="p-5 hover:bg-gray-50/50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">

                  {/* Name + status */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-display font-semibold text-gray-900 text-sm">
                      {lead.name || 'Unknown'}
                    </p>
                    {statusBadge(lead.status)}
                  </div>

                  {/* Service type */}
                  <p className="text-sm text-[#004B93] font-medium">
                    {lead.service_type || 'No service type'}
                  </p>

                  {/* Contact row */}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {lead.phone && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Phone size={10} className="shrink-0" />{lead.phone}
                      </span>
                    )}
                    {lead.email && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Mail size={10} className="shrink-0" />{lead.email}
                      </span>
                    )}
                  </div>

                  {/* Address */}
                  {lead.address && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                      <MapPin size={10} className="shrink-0 text-[#00B4C5]" />{lead.address}
                    </span>
                  )}

                  {/* Details */}
                  {lead.details && (
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-2">
                      {lead.details}
                    </p>
                  )}

                  {/* Assigned to */}
                  {lead.profiles?.full_name && (
                    <div className="flex items-center gap-1 mt-2">
                      <CheckCircle size={11} className="text-green-400 shrink-0" />
                      <span className="text-xs text-gray-400">
                        Assigned to <span className="font-medium text-gray-600">{lead.profiles.full_name}</span>
                      </span>
                    </div>
                  )}

                  {/* Assign button for unassigned */}
                  {lead.status === 'unassigned' && profile?.role === 'manager' && (
                    <button
                      onClick={() => setAssigningLead(lead)}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#004B93] text-white text-xs font-semibold hover:bg-[#003d7a] transition-colors"
                    >
                      <UserPlus size={12} />
                      Assign Technician
                    </button>
                  )}
                </div>

                {/* Timer */}
                <div className="shrink-0">
                  {lead.timer_expires_at && lead.status === 'assigned' && (
                    <div className="flex items-center gap-1">
                      <Clock size={11} className="text-gray-300" />
                      <CountdownTimer expiresAt={lead.timer_expires_at} onExpire={fetchLeads} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}