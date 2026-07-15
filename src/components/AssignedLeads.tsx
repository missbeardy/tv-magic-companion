// src/components/AssignedLeads.tsx
// Last updated: 13 June 2026 - clickable cards, proper navigation

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from './CountdownTimer'
import EventModal from './EventModal'
import LeadExtractedSummary from './LeadExtractedSummary'
import { CalendarPlus, User } from 'lucide-react'
import { isManagerRole } from '../lib/roles'
import { useRestoreLeadBookingDraft } from '../hooks/useRestoreLeadBookingDraft'

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
  profiles: { full_name: string; role?: string } | null
  address?: string
}

function AssignedLeadSkeleton() {
  return (
    <div className="p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-100 rounded-lg w-40" />
          <div className="h-3 bg-gray-100 rounded-lg w-28" />
          <div className="h-3 bg-gray-100 rounded-lg w-52" />
          <div className="h-8 bg-gray-100 rounded-lg w-36 mt-3" />
        </div>
        <div className="h-8 bg-gray-100 rounded-lg w-20 shrink-0" />
      </div>
    </div>
  )
}

export default function AssignedLeads() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingLead, setBookingLead] = useState<Lead | null>(null)

  async function fetchLeads() {
    if (!profile) return
    let query = supabase
      .from('leads')
      .select('*, profiles!leads_assigned_to_fkey(full_name, role)')
      .eq('org_id', profile.org_id)
      .eq('status', 'assigned')
      .is('deleted_at', null)
      .order('timer_expires_at', { ascending: true })
    query = query.eq('assigned_to', profile.id)
    const { data } = await query
    if (data) setLeads(data as Lead[])
    setLoading(false)
  }

  useEffect(() => {
    if (!profile) return
    fetchLeads()
    const channel = supabase
      .channel('assigned-leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchLeads())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile])

  useRestoreLeadBookingDraft(
    profile?.id,
    profile?.org_id,
    leads,
    setBookingLead,
    bookingLead,
  )

  // Navigate to leads page and highlight this lead
  const handleLeadClick = (leadId: string) => {
    navigate(`/leads?highlight=${leadId}`)
  }

  if (loading) {
    return (
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 bg-gray-100 rounded-lg w-40 animate-pulse" />
        </div>
        <div className="divide-y divide-gray-50">
          <AssignedLeadSkeleton />
          <AssignedLeadSkeleton />
        </div>
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
          <User size={18} className="text-gray-300" />
        </div>
        <p className="text-gray-400 text-sm font-medium">No assigned leads</p>
        <p className="text-gray-300 text-xs mt-1">New leads will appear here when assigned to you</p>
      </div>
    )
  }

  return (
    <>
      {bookingLead && (
        <EventModal
          prefillLead={bookingLead}
          onClose={() => setBookingLead(null)}
          onSaved={() => setBookingLead(null)}
        />
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-display font-semibold text-gray-800 text-base">My Assigned Leads</h3>
          <span className="badge badge-cyan">{leads.length}</span>
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
                    <p className="font-display font-semibold text-gray-900 text-sm">{lead.name || 'Unknown'}</p>
                    {isManagerRole(profile?.role) && lead.assigned_to === profile?.id && (
                      <span className="badge badge-purple">Self-assigned</span>
                    )}
                  </div>
                  <p className="text-sm text-[#004B93] font-medium">{lead.service_type || 'No service type'}</p>
                  <LeadExtractedSummary lead={lead} size="sm" detailsClamp showAddress={false} />
                </div>

                {/* Right side: Book button + Timer */}
                <div className="shrink-0 flex flex-col items-end gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setBookingLead(lead)
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#004B93] text-white text-xs font-semibold hover:bg-[#003d7a] transition-colors"
                  >
                    <CalendarPlus size={12} />
                    Book
                  </button>
                  {lead.timer_expires_at && (
                    <CountdownTimer expiresAt={lead.timer_expires_at} onExpire={fetchLeads} showPoolHint />
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