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
import NavBar from '../components/NavBar'
import CountdownTimer from '../components/CountdownTimer'
import LeadStatusMenu from '../components/LeadStatusMenu'
import LeadPhotos from '../components/LeadPhotos'
import AssignLeadModal from '../components/AssignLeadModal'
import EventModal from '../components/EventModal'
import DemoToggle from '../components/DemoToggle'
import BottomSheet from '../components/BottomSheet'
import CompletionChecklist from '../components/CompletionChecklist'
import SignatureCanvas from '../components/SignatureCanvas'
import ReceiptPreview from '../components/ReceiptPreview'
import LeadFilterBar from '../components/LeadFilterBar'
import type { FilterState } from '../components/LeadFilterBar'

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
  lead_source?: string | null
  raw_email?: string | null
  raw_sms?: string | null
  profiles: { full_name: string } | null
}

interface LeadEvent {
  id: string
  event_type: string
  note: string | null
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'unassigned',        label: 'Unassigned',        color: 'border-gray-300',   badge: 'bg-gray-100 text-gray-600'     },
  { key: 'assigned',          label: 'Assigned',          color: 'border-blue-300',   badge: 'bg-blue-100 text-blue-700'     },
  { key: 'contact_attempted', label: 'Contact Attempted', color: 'border-amber-300',  badge: 'bg-amber-100 text-amber-700'   },
  { key: 'booked',            label: 'Booked',            color: 'border-indigo-300', badge: 'bg-indigo-100 text-indigo-700' },
  { key: 'lost',              label: 'Lost',              color: 'border-red-300',    badge: 'bg-red-100 text-red-600'       },
  { key: 'completed',         label: 'Completed',         color: 'border-purple-300', badge: 'bg-purple-100 text-purple-700' },
]

const MOBILE_TABS = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned',   label: 'Assigned'   },
  { key: 'contact',    label: 'Contacted'  },
  { key: 'closed',     label: 'Done / Lost'},
]

function getColumnsForTab(tab: string): string[] {
  if (tab === 'unassigned') return ['unassigned']
  if (tab === 'assigned')   return ['assigned']
  if (tab === 'contact')    return ['contact_attempted', 'booked']
  if (tab === 'closed')     return ['lost', 'completed']
  return []
}

const EMPTY_FILTERS: FilterState = { search: '', source: '', assignee: '' }

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
  onRefresh: () => void
}

function LeadCard({
  lead,
  profile,
  expandedLead,
  onToggleExpand,
  onOpenSheet,
  onAssign,
  onBook,
  onRefresh,
}: LeadCardProps) {
  const isExpanded = expandedLead === lead.id
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
      className="bg-gray-50 rounded-lg p-3 border border-gray-200 cursor-pointer md:cursor-default"
      onClick={() => onOpenSheet(lead)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-800 text-sm truncate">{lead.name || 'Unknown'}</p>
          <p className="text-xs text-gray-500 truncate">{lead.service_type}</p>
        </div>
        <div onClick={e => e.stopPropagation()}>
          <LeadStatusMenu
            leadId={lead.id}
            currentStatus={lead.status}
            assignedTo={lead.assigned_to}
            leadName={lead.name}
            serviceType={lead.service_type}
            onUpdated={onRefresh}
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
            const encoded = encodeURIComponent(lead.address as string)
            window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank')
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
          <p className="text-xs text-gray-600">{lead.phone}</p>
          <p className="text-xs text-gray-600">{lead.email}</p>
          {lead.details && <p className="text-xs text-gray-500">{lead.details}</p>}

          {lead.raw_email && (
            <details className="mt-3">
              <summary className="text-xs font-medium text-gray-500 cursor-pointer select-none">
                📧 View original email
              </summary>
              <pre className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap overflow-auto max-h-48">
                {lead.raw_email}
              </pre>
            </details>
          )}

          {lead.raw_sms && !lead.raw_email && (
            <details className="mt-3">
              <summary className="text-xs font-medium text-gray-500 cursor-pointer select-none">
                💬 View original SMS / call details
              </summary>
              <pre className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap overflow-auto max-h-48">
                {(() => {
                  try { return JSON.stringify(JSON.parse(lead.raw_sms!), null, 2) }
                  catch { return lead.raw_sms }
                })()}
              </pre>
            </details>
          )}

          <div className="flex flex-wrap gap-1 mt-2">
            {lead.status === 'unassigned' && profile?.role === 'manager' && (
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
  onRefresh: () => void
}

function MobileKanbanColumn({ col, leads, profile, expandedLead, onToggleExpand, onOpenSheet, onAssign, onBook, onRefresh }: KanbanColumnProps) {
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
          <p className="text-xs text-gray-400 text-center py-4">No leads</p>
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
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </div>
  )
}

// ── KanbanColumn — Desktop (drag wrappers active) ────────────────────────

function DesktopKanbanColumn({ col, leads, profile, expandedLead, onToggleExpand, onOpenSheet, onAssign, onBook, onRefresh }: KanbanColumnProps) {
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
            <p className="text-xs text-gray-400 text-center py-4">No leads</p>
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
                onRefresh={onRefresh}
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
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [assigningLead, setAssigningLead] = useState<Lead | null>(null)
  const [bookingLead, setBookingLead] = useState<Lead | null>(null)
  const [expandedLead, setExpandedLead] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'unassigned' | 'assigned' | 'contact' | 'closed'>('unassigned')
  const [sheetLead, setSheetLead] = useState<Lead | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const [showChecklist, setShowChecklist] = useState(false)
  const [checklistLead, setChecklistLead] = useState<Lead | null>(null)
  const [showSignature, setShowSignature] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [receiptLead, setReceiptLead] = useState<Lead | null>(null)

  const sources   = Array.from(new Set(leads.map(l => l.lead_source).filter(Boolean))) as string[]
  const assignees = Array.from(new Set(leads.map(l => l.profiles?.full_name).filter(Boolean))) as string[]

  const filteredLeads = leads.filter(lead => {
    const q = filters.search.toLowerCase()
    if (q) {
      const matchName  = (lead.name  ?? '').toLowerCase().includes(q)
      const matchPhone = (lead.phone ?? '').toLowerCase().includes(q)
      if (!matchName && !matchPhone) return false
    }
    if (filters.source   && lead.lead_source          !== filters.source)   return false
    if (filters.assignee && lead.profiles?.full_name  !== filters.assignee) return false
    return true
  })

  const fetchLeads = useCallback(async () => {
  let query = supabase
    .from('leads')
    .select('*, profiles(full_name)')
    .eq('org_id', profile?.org_id)  // ← ADD THIS LINE - filter by org
    .order('created_at', { ascending: false })
  
  if (profile?.role === 'employee') {
    query = query.or(`status.eq.unassigned,assigned_to.eq.${profile.id}`)
  }
  
  const { data } = await query
  if (data) setLeads(data as Lead[])
  loading && setLoading(false)
}, [profile, loading])

  const logLeadEvent = useCallback(async (leadId: string, eventType: string, note?: string) => {
    await supabase.from('lead_events').insert({
      lead_id: leadId,
      event_type: eventType,
      note: note ?? null,
      created_by: profile?.id ?? null,
    })
  }, [profile?.id])

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
    if (newStatus === 'assigned' && !lead.assigned_at) {
      updatePayload.assigned_at = new Date().toISOString()
    }

    const { error } = await supabase.from('leads').update(updatePayload).eq('id', leadId)
    if (error) {
      fetchLeads()
    } else {
      await logLeadEvent(leadId, 'status_change', `Status changed to ${newStatus} via drag`)
    }
  }

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

  const confirmComplete = useCallback(async () => {
    setShowChecklist(false)
    setShowSignature(true)
  }, [])

  const saveSignatureAndComplete = useCallback(async (dataUrl: string) => {
    if (!checklistLead) return
    await supabase
      .from('leads')
      .update({ status: 'completed', signature_data: dataUrl })
      .eq('id', checklistLead.id)
    await logLeadEvent(checklistLead.id, 'signed_off', 'Customer signature captured')
    setReceiptLead(checklistLead)
    setShowReceipt(true)
    setShowSignature(false)
    setChecklistLead(null)
    closeSheet()
    fetchLeads()
  }, [checklistLead, logLeadEvent, closeSheet, fetchLeads])

  const handleCall = useCallback(async (lead: Lead) => {
    const confirmed = window.confirm(
      `Call ${lead.name}?\n\nThis will update the lead status to "Contact Attempted".`
    )
    if (!confirmed) return
    await supabase.from('leads').update({ status: 'contact_attempted' }).eq('id', lead.id)
    await logLeadEvent(lead.id, 'call_attempted', `Called ${lead.phone}`)
    window.location.href = `tel:${lead.phone}`
    closeSheet()
    fetchLeads()
  }, [logLeadEvent, closeSheet, fetchLeads])

  const handleSMS = useCallback((lead: Lead) => {
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
    window.open(`sms:${to}?body=${encodeURIComponent(message)}`, '_blank')
    closeSheet()
  }, [closeSheet, profile?.full_name])

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
    await logLeadEvent(lead.id, 'status_change', 'Status updated to Contact Attempted')
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
    return filteredLeads.filter(l => l.status === status)
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
    onRefresh: fetchLeads,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {showChecklist && (
        <CompletionChecklist
          onConfirm={confirmComplete}
          onCancel={() => setShowChecklist(false)}
        />
      )}
      {showSignature && (
        <SignatureCanvas
          onSave={saveSignatureAndComplete}
          onSkip={() => saveSignatureAndComplete('')}
        />
      )}
      {showReceipt && receiptLead && (
        <ReceiptPreview
          lead={receiptLead}
          onClose={() => { setShowReceipt(false); setReceiptLead(null) }}
        />
      )}
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

      <main className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Leads</h2>
            <p className="text-gray-500 text-sm">Manage and track all leads across every stage.</p>
          </div>
          {profile?.role === 'manager' && <DemoToggle />}
        </div>

        {!loading && (
          <LeadFilterBar
            filters={filters}
            onChange={setFilters}
            sources={sources}
            assignees={assignees}
            userId={profile?.id ?? 'guest'}
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

      <BottomSheet isOpen={sheetOpen} onClose={closeSheet} title={sheetLead?.name ?? 'Lead Actions'}>
        {sheetLead && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">{sheetLead.service_type}</p>

            {sheetLead.raw_email && (
              <details className="mt-3">
                <summary className="text-xs font-medium text-gray-500 cursor-pointer">
                  View original email
                </summary>
                <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap overflow-auto max-h-48">
                  {sheetLead.raw_email}
                </pre>
              </details>
            )}

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
                    onClick={() => {
                      const encoded = encodeURIComponent(sheetLead!.address as string)
                      window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank')
                    }}
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
                {sheetLead.status === 'unassigned' && profile?.role === 'manager' && (
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
                <button
                  onClick={() => { setBookingLead(sheetLead); closeSheet() }}
                  className="w-full py-4 rounded-xl bg-gray-100 text-gray-700 font-semibold text-base"
                >
                  📅 Book Appointment
                </button>
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

            <button
              onClick={closeSheet}
              className="w-full py-4 rounded-xl bg-gray-50 text-gray-400 font-semibold text-base border border-gray-200"
            >
              Close
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}