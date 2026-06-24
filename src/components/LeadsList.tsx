// src/components/LeadsList.tsx
// Last updated: 13 June 2026
// Restored: Assign button, real-time updates, clickable cards, proper data fetching

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import AssignLeadModal from './AssignLeadModal'
import EventModal from './EventModal'
import { MapPin, Phone, Mail, UserPlus, Inbox } from 'lucide-react'
import { isManagerRole } from '../lib/roles'

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
  lead_source?: string | null
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

export default function LeadsList() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [assigningLead, setAssigningLead] = useState<Lead | null>(null)
  const [bookingLead, setBookingLead] = useState<Lead | null>(null)

  async function fetchLeads() {
    if (!profile?.org_id) return

    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('org_id', profile.org_id)
      .eq('status', 'unassigned')
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

  const handleLeadClick = (leadId: string) => {
    navigate(`/leads?highlight=${leadId}`)
  }

  if (loading) {
    return (
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-100 rounded-lg w-32 animate-pulse" />
        </div>
        <div className="divide-y divide-gray-50">
          <LeadSkeleton />
          <LeadSkeleton />
          <LeadSkeleton />
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
        <p className="text-gray-400 text-sm font-medium">No unassigned leads</p>
        <p className="text-gray-300 text-xs mt-1">New leads will appear here</p>
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
      {bookingLead && (
        <EventModal
          prefillLead={bookingLead}
          onClose={() => setBookingLead(null)}
          onSaved={() => setBookingLead(null)}
        />
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-display font-semibold text-gray-800 text-base">Unassigned Leads</h3>
          <span className="badge badge-blue">{leads.length}</span>
        </div>

        <div className="divide-y divide-gray-50">
          {leads.map(lead => (
            <div key={lead.id} className="p-5 hover:bg-gray-50/50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                {/* Clickable lead info */}
                <div
                  onClick={() => handleLeadClick(lead.id)}
                  className="flex-1 min-w-0 cursor-pointer"
                >
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-display font-semibold text-gray-900 text-sm">
                      {lead.name || 'Unknown'}
                    </p>
                    {lead.lead_source && (
                      <span className="badge badge-grey text-[10px]">{lead.lead_source}</span>
                    )}
                  </div>

                  <p className="text-sm text-[#004B93] font-medium">
                    {lead.service_type || 'No service type'}
                  </p>

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

                  {lead.address && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                      <MapPin size={10} className="shrink-0 text-[#00B4C5]" />{lead.address}
                    </span>
                  )}

                  {lead.details && (
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-2">
                      {lead.details}
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="shrink-0 flex flex-col gap-2">
                  {isManagerRole(profile?.role) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAssigningLead(lead) }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#004B93] text-white text-xs font-semibold hover:bg-[#003d7a] transition-colors"
                    >
                      <UserPlus size={12} />
                      Assign
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setBookingLead(lead) }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00B4C5] text-white text-xs font-semibold hover:bg-[#009aaa] transition-colors"
                  >
                    📅 Book
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}