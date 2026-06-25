// src/pages/LeadsPage.tsx
import { useEffect, useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import NavBar from '../components/NavBar'
import CountdownTimer from '../components/CountdownTimer'
import LeadStatusMenu from '../components/LeadStatusMenu'
import LeadPhotos from '../components/LeadPhotos'
import AssignLeadModal from '../components/AssignLeadModal'
import EventModal from '../components/EventModal'
import BottomSheet from '../components/BottomSheet'
import CompletionChecklist from '../components/CompletionChecklist'
import ReviewRequestModal from '../components/ReviewRequestModal'
import QuoteComposerModal from '../components/QuoteComposerModal'
import LeadExtractedSummary, { LeadRawSource } from '../components/LeadExtractedSummary'
import { UserPlus, Inbox, ChevronRight, Plus } from 'lucide-react'
import AddLeadModal from '../components/AddLeadModal'
import { openNavigation } from '../lib/navigation'
import { isManagerRole } from '../lib/roles'
import { getColumnsForTab, isLeadVisibleInActiveKanban } from '../lib/leadsKanban'
import { isReviewRequestEligible, sendReviewRequestSms } from '../lib/reviewRequest'
import { logLeadEvent as recordLeadEvent } from '../lib/leadEvents'
import type { LeadEventType } from '../lib/leadEventPayload'

// ── Types ───────────────────────────────────────────────────────────────────

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
  address: string | undefined
  review_request_sent_at?: string | null
  lead_source?: string | null
  raw_email?: string | null
  raw_sms?: string | null
  hidden_from_kanban_at?: string | null
  latest_quote_status?: string | null
  latest_quote_accepted_at?: string | null
  profiles: { full_name: string } | null
}

interface LeadEvent {
  id: string
  event_type: string
  note: string | null
  created_at: string
}

interface LeadQuoteSummary {
  lead_id: string
  status: string
  accepted_at: string | null
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'unassigned',        label: 'Unassigned',        color: 'border-gray-300',   badge: 'bg-gray-100 text-gray-600'     },
  { key: 'assigned',          label: 'Assigned',          color: 'border-blue-300',   badge: 'bg-blue-100 text-blue-700'     },
  { key: 'contact_attempted', label: 'Contact Attempted', color: 'border-amber-300',  badge: 'bg-amber-100 text-amber-700'   },
  { key: 'booked',            label: 'Booked',            color: 'border-indigo-300', badge: 'bg-indigo-100 text-indigo-700' },
  { key: 'booking_cancelled', label: 'Booking Cancelled', color: 'border-red-400',    badge: 'bg-red-100 text-red-700'       },
  { key: 'lost',              label: 'Lost',              color: 'border-red-300',    badge: 'bg-red-100 text-red-600'        },
  { key: 'completed',         label: 'Completed',         color: 'border-purple-300', badge: 'bg-purple-100 text-purple-700' },
]

const MOBILE_TABS = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned',   label: 'Assigned'   },
  { key: 'contact',    label: 'Contacted'  },
  { key: 'closed',     label: 'Done / Lost'},
]

// getColumnsForTab imported from ../lib/leadsKanban

// ── Drag-and-drop: Droppable Column Wrapper (desktop only) ───────────────

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 transition-colors duration-150 ${isOver ? 'bg-blue-50 rounded-xl' : ''}`}
    >
      {children}
    </div>
  )
}

// ── Drag-and-drop: Draggable Card Wrapper (desktop only) ─────────────────

function DraggableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    touchAction: 'none' as const,
  }
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  )
}

// ── LeadCard Component ──────────────────────────────────────────────────────

interface LeadCardProps {
  lead: Lead
  profile: { role: string; id: string } | null
  expandedLead: string | null
  onToggleExpand: (leadId: string | null) => void
  onOpenSheet: (lead: Lead) => void
  onAssign: (lead: Lead) => void
  onBook: (lead: Lead) => void
  onCreateQuote: (lead: Lead) => void
  quoteEnabled: boolean
  onComplete: (lead: Lead) => void
  onRefresh: () => void
  onLogEvent: (leadId: string, eventType: LeadEventType, note?: string, payload?: Record<string, unknown>) => Promise<void>
}

function LeadCard({
  lead,
  profile,
  expandedLead,
  onToggleExpand,
  onOpenSheet,
  onAssign,
  onBook,
  onCreateQuote,
  quoteEnabled,
  onComplete,
  onRefresh,
  onLogEvent,
}: LeadCardProps) {
  const isExpanded = expandedLead === lead.id
  const isBookingCancelled = lead.status === 'booking_cancelled'
  const isQuoteAccepted = lead.latest_quote_status === 'accepted'
  const [events, setEvents] = useState<LeadEvent[]>([])

  useEffect(() => {
    if (!isExpanded) return
    let cancelled = false
    supabase
      .from('lead_events')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!cancelled) setEvents((data as LeadEvent[]) ?? [])
      })
    return () => { cancelled = true }
  }, [isExpanded, lead.id])

  return (
    <div
      className={`rounded-lg p-3 border cursor-pointer md:cursor-default ${
        isBookingCancelled
          ? 'bg-red-50 border-red-300 ring-1 ring-red-200'
          : isQuoteAccepted
          ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
          : 'bg-gray-50 border-gray-200'
      }`}
      onClick={() => {
        // ONLY open the bottom sheet action drawer if the viewport is mobile (under 768px wide)
        if (window.innerWidth < 768) {
          onOpenSheet(lead)
        }
      }}
    >
      {isBookingCancelled && (
        <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 mb-2">
          Booking Cancelled
        </p>
      )}
      {!isBookingCancelled && isQuoteAccepted && (
        <p className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5 mb-2">
          Quote Accepted
        </p>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm truncate ${
            isBookingCancelled ? 'text-red-900' : isQuoteAccepted ? 'text-emerald-900' : 'text-gray-800'
          }`}>
            {lead.name || 'Unknown'}
          </p>
          <p className={`text-xs truncate ${
            isBookingCancelled ? 'text-red-700/80' : isQuoteAccepted ? 'text-emerald-700/80' : 'text-gray-500'
          }`}>
            {lead.service_type}
          </p>
          <div className="md:hidden mt-1">
            <LeadExtractedSummary lead={lead} size="sm" detailsClamp showAddress={false} />
          </div>
        </div>
        {/* Mobile tap affordance — hidden on desktop */}
        <ChevronRight size={14} className="md:hidden text-gray-300 shrink-0 mt-0.5" />
        <div onClick={e => e.stopPropagation()}>
          <LeadStatusMenu
            leadId={lead.id}
            currentStatus={lead.status}
            assignedTo={lead.assigned_to}
            leadName={lead.name}
            leadPhone={lead.phone}
            reviewRequestSentAt={lead.review_request_sent_at}
            serviceType={lead.service_type}
            onUpdated={onRefresh}
            logEvent={(id, note) => onLogEvent(id, 'review_request', note)}
            onCompleteRequested={() => onComplete(lead)}
          />
        </div>
      </div>

      {lead.timer_expires_at && lead.status === 'assigned' && (
        <div className="mt-2">
          <CountdownTimer expiresAt={lead.timer_expires_at} />
        </div>
      )}

      {lead.address && (
        <button
          onClick={e => {
            e.stopPropagation()
            openNavigation(lead.address as string)
          }}
          className="text-xs text-[#00B4C5] underline flex items-center gap-1 mt-1"
        >
          📍 {lead.address}
        </button>
      )}

      {lead.lead_source && (
        <span className="inline-block text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 mt-1">
          {lead.lead_source}
        </span>
      )}
      {lead.status === 'contact_attempted' && (
        <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
          📞 Contact Attempted
        </span>
      )}
      {!isBookingCancelled && isQuoteAccepted && (
        <span className="inline-block mt-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
          Quote Accepted
        </span>
      )}
      {lead.profiles && (
        <p className="text-xs text-[#004B93] mt-1 font-medium">→ {lead.profiles.full_name}</p>
      )}

      {lead.status === 'unassigned' && (
        <button
          onClick={e => { e.stopPropagation(); onAssign(lead) }}
          className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[#004B93] text-white hover:bg-[#003d7a] transition"
        >
          + Assign
        </button>
      )}

      <button
        onClick={e => { e.stopPropagation(); onToggleExpand(isExpanded ? null : lead.id) }}
        className="hidden md:block text-xs text-gray-400 hover:text-gray-600 mt-2 transition"
      >
        {isExpanded ? '▲ Less' : '▼ More'}
      </button>

      {isExpanded && (
        <div className="hidden md:block mt-2 space-y-2 border-t border-gray-200 pt-2">
          <LeadExtractedSummary lead={lead} size="sm" />
          <LeadRawSource lead={lead} />

          <div className="flex flex-wrap gap-1 mt-2">
            {lead.status === 'unassigned' && isManagerRole(profile?.role) && (
              <button
                onClick={e => { e.stopPropagation(); onAssign(lead) }}
                className="text-xs bg-[#004B93] text-white px-2 py-1 rounded-lg hover:bg-[#003d7a] transition"
              >
                Assign
              </button>
            )}
            {lead.status === 'unassigned' && profile?.role === 'employee' && (
              <button
                onClick={e => { e.stopPropagation(); onAssign(lead) }}
                className="text-xs bg-[#00B4C5] text-white px-2 py-1 rounded-lg hover:bg-[#009aaa] transition"
              >
                Self-Assign
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); onBook(lead) }}
              className="text-xs bg-[#00B4C5] text-white px-2 py-1 rounded-lg hover:bg-[#009aaa] transition"
            >
              📅 Book
            </button>
            {isManagerRole(profile?.role) && quoteEnabled && (
              <button
                onClick={e => { e.stopPropagation(); onCreateQuote(lead) }}
                className="text-xs bg-gray-900 text-white px-2 py-1 rounded-lg hover:bg-black transition"
              >
                🧾 Quote
              </button>
            )}
          </div>

          {lead.status === 'completed' && (
            <LeadPhotos leadId={lead.id} canUpload={true} />
          )}

          {events.length > 0 && (
            <div className="mt-3 border-t border-gray-200 pt-3 space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Activity</p>
              {events.map(ev => (
                <p key={ev.id} className="text-xs text-gray-500">
                  {new Date(ev.created_at).toLocaleString()} — {ev.note ?? ev.event_type}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── KanbanColumn — Mobile (no drag wrappers) ─────────────────────────────

interface KanbanColumnProps {
  col: typeof COLUMNS[0]
  leads: Lead[]
  profile: { role: string; id: string } | null
  expandedLead: string | null
  onToggleExpand: (leadId: string | null) => void
  onOpenSheet: (lead: Lead) => void
  onAssign: (lead: Lead) => void
  onBook: (lead: Lead) => void
  onCreateQuote: (lead: Lead) => void
  quoteEnabled: boolean
  onComplete: (lead: Lead) => void
  onRefresh: () => void
  onLogEvent: (leadId: string, eventType: LeadEventType, note?: string, payload?: Record<string, unknown>) => Promise<void>
}

function MobileKanbanColumn({ col, leads, profile, expandedLead, onToggleExpand, onOpenSheet, onAssign, onBook, onCreateQuote, quoteEnabled, onComplete, onRefresh, onLogEvent }: KanbanColumnProps) {
  return (
    <div className={`w-full bg-white rounded-xl border-t-4 ${col.color} shadow-sm border border-gray-200`}>
      <div className="p-3 border-b border-gray-100 flex items-center justify-between">
        <span className="font-semibold text-gray-700 text-sm">{col.label}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badge}`}>
          {leads.length}
        </span>
      </div>
      <div className="p-2 space-y-2">
       {leads.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-xs text-gray-400">No leads here yet</p>
            <p className="text-[10px] text-gray-300 mt-0.5">New leads will appear in this column</p>
          </div>
        )}
        {leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            profile={profile}
            expandedLead={expandedLead}
            onToggleExpand={onToggleExpand}
            onOpenSheet={onOpenSheet}
            onAssign={onAssign}
            onBook={onBook}
            onCreateQuote={onCreateQuote}
            quoteEnabled={quoteEnabled}
            onComplete={onComplete}
            onRefresh={onRefresh}
            onLogEvent={onLogEvent}
          />
        ))}
      </div>
    </div>
  )
}

// ── KanbanColumn — Desktop (drag wrappers active) ────────────────────────

function DesktopKanbanColumn({ col, leads, profile, expandedLead, onToggleExpand, onOpenSheet, onAssign, onBook, onCreateQuote, quoteEnabled, onComplete, onRefresh, onLogEvent }: KanbanColumnProps) {
  return (
    <DroppableColumn id={col.key}>
      <div className={`flex-shrink-0 w-72 bg-white rounded-xl border-t-4 ${col.color} shadow-sm border border-gray-200 h-full`}>
        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
          <span className="font-semibold text-gray-700 text-sm">{col.label}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badge}`}>
            {leads.length}
          </span>
        </div>
        <div className="p-2 space-y-2 max-h-screen overflow-y-auto">
          {leads.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-xs text-gray-400">No leads here yet</p>
              <p className="text-[10px] text-gray-300 mt-0.5">New leads will appear in this column</p>
            </div>
          )}
          {leads.map(lead => (
            <DraggableCard key={lead.id} id={lead.id}>
              <LeadCard
                key={lead.id}
                lead={lead}
                profile={profile}
                expandedLead={expandedLead}
                onToggleExpand={onToggleExpand}
                onOpenSheet={onOpenSheet}
                onAssign={onAssign}
                onBook={onBook}
                onCreateQuote={onCreateQuote}
                quoteEnabled={quoteEnabled}
                onComplete={onComplete}
                onRefresh={onRefresh}
                onLogEvent={onLogEvent}
              />
            </DraggableCard>
          ))}
        </div>
      </div>
    </DroppableColumn>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { profile } = useAuth()
  const { org, isFeatureEnabled, featureSwitchesLoading } = useOrg()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddLead, setShowAddLead] = useState(false)
  const [assigningLead, setAssigningLead] = useState<Lead | null>(null)
  const [bookingLead, setBookingLead] = useState<Lead | null>(null)
  const [expandedLead, setExpandedLead] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'unassigned' | 'assigned' | 'contact' | 'closed'>('unassigned')
  const [sheetLead, setSheetLead] = useState<Lead | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [checklistLead, setChecklistLead] = useState<Lead | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [reviewModalLead, setReviewModalLead] = useState<Lead | null>(null)
  const [quoteLead, setQuoteLead] = useState<Lead | null>(null)
  const [reviewSending, setReviewSending] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const quoteFeatureEnabled = !featureSwitchesLoading && isFeatureEnabled('quote_esign')

  const fetchLeads = useCallback(async () => {
    if (!profile?.org_id) return

    let query = supabase
      .from('leads')
      .select('*, profiles(full_name)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (profile?.role === 'employee') {
      query = query.or(`status.eq.unassigned,assigned_to.eq.${profile.id}`)
    }

    const { data } = await query
    if (data) {
      const baseLeads = data as Lead[]
      if (baseLeads.length === 0) {
        setLeads([])
        setLoading(false)
        return
      }

      const leadIds = baseLeads.map((lead) => lead.id)
      let quoteRows: LeadQuoteSummary[] = []
      try {
        const quotesRes = await supabase
          .from('quotes')
          .select('lead_id, status, accepted_at, created_at')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false })
        if (!quotesRes.error && quotesRes.data) {
          quoteRows = quotesRes.data as LeadQuoteSummary[]
        } else if (quotesRes.error) {
          console.warn('Quotes table unavailable or query failed; skipping quote card state.', quotesRes.error.message)
        }
      } catch (err) {
        console.warn('Quotes fetch skipped due to runtime error:', err)
      }

      const latestQuoteByLead = new Map<string, LeadQuoteSummary>()
      for (const row of quoteRows) {
        if (!latestQuoteByLead.has(row.lead_id)) {
          latestQuoteByLead.set(row.lead_id, row)
        }
      }

      const merged = baseLeads.map((lead) => {
        const latestQuote = latestQuoteByLead.get(lead.id)
        return {
          ...lead,
          latest_quote_status: latestQuote?.status ?? null,
          latest_quote_accepted_at: latestQuote?.accepted_at ?? null,
        }
      })
      setLeads(merged)
    }
    setLoading(false)
  }, [profile?.org_id, profile?.role, profile?.id])

  const logLeadEvent = useCallback(async (
    leadId: string,
    eventType: LeadEventType,
    note?: string,
    payload?: Record<string, unknown>
  ) => {
    if (!profile?.org_id) return

    await recordLeadEvent({
      leadId,
      orgId: profile.org_id,
      eventType,
      note,
      actorId: profile.id,
      payload,
    })
  }, [profile?.id, profile?.org_id])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null)
    const { active, over } = event
    if (!over) return
    const leadId    = active.id as string
    const newStatus = over.id   as string
    const lead      = leads.find(l => l.id === leadId)
    if (!lead || lead.status === newStatus) return

    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l))

    const updatePayload: Record<string, unknown> = { status: newStatus }

    if (newStatus === 'unassigned') {
      updatePayload.assigned_to = null
      updatePayload.assigned_at = null
      updatePayload.timer_expires_at = null
    } else if (newStatus === 'assigned' && !lead.assigned_at) {
      updatePayload.assigned_at = new Date().toISOString()
    }

    const { error } = await supabase.from('leads').update(updatePayload).eq('id', leadId)
    if (error) {
      fetchLeads()
    } else {
      await logLeadEvent(
        leadId,
        newStatus === 'contact_attempted' ||
          newStatus === 'booked' ||
          newStatus === 'lost' ||
          newStatus === 'completed' ||
          newStatus === 'expired'
          ? newStatus
          : 'status_change',
        `Status changed from ${lead.status} to ${newStatus} via drag`,
        { from_status: lead.status, to_status: newStatus, source: 'drag' }
      )
      if (newStatus === 'completed') {
        const eligible = await isReviewRequestEligible(org, lead, profile?.org_id)
        if (eligible) {
          setReviewModalLead(lead)
        }
      }
    }
  }

  const closeReviewModal = useCallback(() => {
    setReviewModalLead(null)
    setReviewError(null)
    setReviewSending(false)
  }, [])

  const handleReviewSend = useCallback(async () => {
    if (!reviewModalLead) return
    setReviewSending(true)
    setReviewError(null)
    const result = await sendReviewRequestSms(
      reviewModalLead,
      (id, note) => logLeadEvent(id, 'review_request', note)
    )
    setReviewSending(false)
    if (!result.ok) {
      setReviewError(result.error)
      return
    }
    closeReviewModal()
    fetchLeads()
  }, [reviewModalLead, logLeadEvent, closeReviewModal, fetchLeads])

  const openSheet = useCallback((lead: Lead) => {
    setSheetLead(lead)
    setSheetOpen(true)
  }, [])

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    setTimeout(() => setSheetLead(null), 300)
  }, [])

  const handleMarkComplete = useCallback((lead: Lead) => {
    setChecklistLead(lead)
    setShowChecklist(true)
    closeSheet()
  }, [closeSheet])

  // Checklist confirmed → mark complete directly, no signature or receipt
  const confirmComplete = useCallback(async () => {
    if (!checklistLead) return
    setShowChecklist(false)
    const lead = checklistLead
    await supabase
      .from('leads')
      .update({ status: 'completed' })
      .eq('id', lead.id)
    await logLeadEvent(
      lead.id,
      'completed',
      'Job marked complete via checklist',
      { from_status: lead.status, to_status: 'completed', source: 'completion_checklist' }
    )
    setChecklistLead(null)
    fetchLeads()
  }, [checklistLead, logLeadEvent, fetchLeads])

  const handleCall = useCallback(async (lead: Lead) => {
    const confirmed = window.confirm(
      `Call ${lead.name}?\n\nThis will update the lead status to "Contact Attempted".`
    )
    if (!confirmed) return
    await supabase.from('leads').update({ status: 'contact_attempted' }).eq('id', lead.id)
    await logLeadEvent(
      lead.id,
      'call_attempted',
      `Called ${lead.phone}`,
      { from_status: lead.status, to_status: 'contact_attempted', channel: 'phone' }
    )
    window.location.href = `tel:${lead.phone}`
    closeSheet()
    fetchLeads()
  }, [logLeadEvent, closeSheet, fetchLeads])

  const handleSMS = useCallback(async (lead: Lead) => {
    if (!lead.phone?.trim()) { alert('No phone number saved for this lead.'); return }
    const rawPhone = lead.phone.replace(/\s+/g, '')
    const to = rawPhone.startsWith('+') ? rawPhone
      : rawPhone.startsWith('0') ? '+61' + rawPhone.slice(1)
      : rawPhone
    const techName = profile?.full_name ?? 'Your technician'
    const mapsUrl = lead.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`
      : null
    const message = mapsUrl
      ? `Hi ${lead.name}, ${techName} from TVMagic is on their way to you. Track the route: ${mapsUrl} — TVMagic Team`
      : `Hi ${lead.name}, ${techName} from TVMagic is on their way to you. — TVMagic Team`
    await logLeadEvent(
      lead.id,
      'sms_attempted',
      `Opened SMS to ${to}`,
      { channel: 'sms', phone: to }
    )
    window.open(`sms:${to}?body=${encodeURIComponent(message)}`, '_blank')
    closeSheet()
  }, [closeSheet, logLeadEvent, profile?.full_name])

  const handleSharePhoto = useCallback(async (lead: Lead) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Job Photos: ${lead.name}`,
          text: `Check out the completed job photos for ${lead.name} (${lead.service_type}).`,
          url: window.location.href,
        })
      } catch {}
    } else {
      alert('Sharing is not supported on this device/browser.')
    }
  }, [])

  const handleMarkContactAttempted = useCallback(async (lead: Lead) => {
    await supabase.from('leads').update({ status: 'contact_attempted' }).eq('id', lead.id)
    await logLeadEvent(
      lead.id,
      'contact_attempted',
      'Status updated to Contact Attempted',
      { from_status: lead.status, to_status: 'contact_attempted', source: 'manual_action' }
    )
    fetchLeads()
    closeSheet()
  }, [logLeadEvent, fetchLeads, closeSheet])

  const handleUnassign = useCallback(async (lead: Lead) => {
    const confirmed = window.confirm(
      `Unassign "${lead.name}" from ${lead.profiles?.full_name ?? 'this employee'}?\n\nThe lead will return to the unassigned pool.`
    )
    if (!confirmed) return
    await supabase
      .from('leads')
      .update({
        status: 'unassigned',
        assigned_to: null,
        assigned_at: null,
        timer_expires_at: null,
      })
      .eq('id', lead.id)
    await logLeadEvent(
      lead.id,
      'unassigned',
      `Manually unassigned by manager`,
      { from_status: lead.status, to_status: 'unassigned', previous_assignee_id: lead.assigned_to }
    )
    fetchLeads()
    closeSheet()
  }, [logLeadEvent, fetchLeads, closeSheet])

  useEffect(() => {
    if (!profile) return
    fetchLeads()
    const channel = supabase
      .channel('leads-page-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchLeads)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile, fetchLeads])

  function leadsForColumn(status: string) {
    return leads.filter(
      (lead) => lead.status === status && isLeadVisibleInActiveKanban(lead.status, lead.hidden_from_kanban_at)
    )
  }

  const activeDragLead = activeDragId ? leads.find(l => l.id === activeDragId) : null

  const columnProps = (col: typeof COLUMNS[0]) => ({
    col,
    leads: leadsForColumn(col.key),
    profile,
    expandedLead,
    onToggleExpand: setExpandedLead,
    onOpenSheet: openSheet,
    onAssign: setAssigningLead,
    onBook: setBookingLead,
    onCreateQuote: quoteFeatureEnabled ? setQuoteLead : () => {},
    quoteEnabled: quoteFeatureEnabled,
    onComplete: handleMarkComplete,
    onRefresh: fetchLeads,
    onLogEvent: logLeadEvent,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {showChecklist && checklistLead && (
        <CompletionChecklist
          lead={checklistLead}
          onComplete={confirmComplete}
          onCancel={() => { setShowChecklist(false); setChecklistLead(null) }}
          logEvent={(id, note) => logLeadEvent(id, 'review_request', note)}
        />
      )}
      {reviewModalLead && reviewModalLead.phone?.trim() && (
        <ReviewRequestModal
          customerName={reviewModalLead.name}
          customerPhone={reviewModalLead.phone.trim()}
          sending={reviewSending}
          error={reviewError}
          onSend={handleReviewSend}
          onSkip={closeReviewModal}
        />
      )}
      {assigningLead && (
        <AssignLeadModal
          lead={assigningLead}
          onClose={() => setAssigningLead(null)}
          onAssigned={fetchLeads}
        />
      )}
      {quoteLead && quoteFeatureEnabled && (
        <QuoteComposerModal
          lead={quoteLead}
          onClose={() => setQuoteLead(null)}
          onSent={fetchLeads}
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

      <main className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Leads</h2>
            <p className="text-gray-500 text-sm">Manage and track all leads across every stage.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddLead(true)}
              className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-[#004B93] hover:bg-[#003d7a] transition"
            >
              <Plus size={14} /> Add Lead
            </button>
          </div>
        </div>

        {showAddLead && (
          <AddLeadModal
            onClose={() => setShowAddLead(false)}
            onCreated={() => { setShowAddLead(false); fetchLeads() }}
          />
        )}

        {loading && <p className="text-gray-400 text-sm">Loading leads...</p>}

        {!loading && (
          <>
            {/* ── Mobile View ── */}
            <div className="md:hidden">
              <div className="sticky top-0 z-10 bg-white border-b border-gray-200 flex mb-3 -mx-4 px-0">
                {MOBILE_TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as typeof activeTab)}
                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                      activeTab === tab.key
                        ? 'text-[#004B93] border-b-2 border-[#004B93]'
                        : 'text-gray-400'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {COLUMNS
                  .filter(col => getColumnsForTab(activeTab).includes(col.key))
                  .map(col => (
                    <MobileKanbanColumn key={col.key} {...columnProps(col)} />
                  ))}
              </div>
            </div>

            {/* ── Desktop View ── */}
            <div className="hidden md:block">
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {COLUMNS.map(col => (
                    <DesktopKanbanColumn key={col.key} {...columnProps(col)} />
                  ))}
                </div>

                <DragOverlay>
                  {activeDragLead && (
                    <div className="bg-white rounded-lg p-3 border border-[#004B93] shadow-xl opacity-90 w-64">
                      <p className="font-medium text-gray-800 text-sm">{activeDragLead.name}</p>
                      <p className="text-xs text-gray-500">{activeDragLead.service_type}</p>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            </div>
          </>
        )}
      </main>

      {sheetOpen && window.innerWidth < 768 && (
        <BottomSheet isOpen={sheetOpen} onClose={closeSheet} title={sheetLead?.name ?? 'Lead Actions'}>
          {sheetLead && (
            <div className="space-y-3">
              {sheetLead.status === 'booking_cancelled' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <span className="text-red-700 font-semibold text-sm">Booking Cancelled</span>
                </div>
              )}
              <p className="text-sm text-[#004B93] font-medium">{sheetLead.service_type || 'No service type'}</p>
              <LeadExtractedSummary lead={sheetLead} size="md" showAddress={false} />

              {sheetLead.status === 'completed' ? (
                <div>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center mb-2">
                    <span className="text-purple-700 font-semibold text-sm">✨ Job Completed Successfully</span>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={() => handleSharePhoto(sheetLead!)}
                      className="w-full py-4 rounded-xl bg-[#004B93] text-white font-semibold text-base flex items-center justify-center gap-2"
                    >
                      📸 Share Photo
                    </button>
                    
                    <a
                      href="tel:04123456789"
                      className="w-full py-4 rounded-xl bg-gray-800 text-white font-semibold text-base flex items-center justify-center gap-2 block text-center"
                    >
                      📞 Call Manager (Nick)
                    </a>
                    
                    <div className="pt-2 border-t border-gray-100">
                      <LeadPhotos leadId={sheetLead.id} canUpload={true} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {sheetLead.address && (
                    <button
                      onClick={() => openNavigation(sheetLead!.address as string)}
                      className="w-full py-4 rounded-xl bg-gray-800 text-white font-semibold text-base flex items-center justify-center gap-2"
                    >
                      📍 Navigate to Job
                    </button>
                  )}
                  <button
                    onClick={() => handleCall(sheetLead!)}
                    className="w-full py-4 rounded-xl bg-[#004B93] text-white font-semibold text-base flex items-center justify-center gap-2"
                  >
                    📞 Call {sheetLead.name}
                  </button>
                  <button
                    onClick={() => handleSMS(sheetLead!)}
                    className="w-full py-4 rounded-xl bg-[#00B4C5] text-white font-semibold text-base flex items-center justify-center gap-2"
                  >
                    💬 Send ETA Text
                  </button>
                  {sheetLead.status === 'unassigned' && isManagerRole(profile?.role) && (
                    <button
                      onClick={() => { setAssigningLead(sheetLead); closeSheet() }}
                      className="w-full py-4 rounded-xl bg-[#004B93] text-white font-semibold text-base"
                    >
                      Assign to Technician
                    </button>
                  )}
                  {sheetLead.status === 'unassigned' && profile?.role === 'employee' && (
                    <button
                      onClick={() => { setAssigningLead(sheetLead); closeSheet() }}
                      className="w-full py-4 rounded-xl bg-[#004B93] text-white font-semibold text-base"
                    >
                      Self-Assign This Lead
                    </button>
                  )}
                  {sheetLead.assigned_to && isManagerRole(profile?.role) && sheetLead.status !== 'unassigned' && (
                    <button
                      onClick={() => handleUnassign(sheetLead!)}
                      className="w-full py-4 rounded-xl bg-orange-500 text-white font-semibold text-base"
                    >
                      ↩ Unassign Lead
                    </button>
                  )}
                  <button
                    onClick={() => { setBookingLead(sheetLead); closeSheet() }}
                    className="w-full py-4 rounded-xl bg-gray-100 text-gray-700 font-semibold text-base"
                  >
                    📅 Book Appointment
                  </button>
                  {quoteFeatureEnabled && isManagerRole(profile?.role) && (
                    <button
                      onClick={() => { setQuoteLead(sheetLead); closeSheet() }}
                      className="w-full py-4 rounded-xl bg-gray-900 text-white font-semibold text-base"
                    >
                      🧾 Send Quote + E-Sign
                    </button>
                  )}
                  <button
                    onClick={() => handleMarkContactAttempted(sheetLead!)}
                    className="w-full py-4 rounded-xl bg-amber-500 text-white font-semibold text-base"
                    >
                    ✅ Mark as Attempted Contact
                  </button>
                  <button
                    onClick={() => handleMarkComplete(sheetLead!)}
                    className="w-full py-4 rounded-xl bg-green-600 text-white font-semibold text-base"
                  >
                    Complete Job ✅
                  </button>
                </div>
              )}

              <LeadRawSource lead={sheetLead} />

              <button
                onClick={closeSheet}
                className="w-full py-4 rounded-xl bg-gray-50 text-gray-400 font-semibold text-base border border-gray-200"
              >
                Close
              </button>
            </div>
          )}
        </BottomSheet>
      )}
    </div>
  )
}