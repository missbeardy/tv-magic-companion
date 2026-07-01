// src/pages/LeadsPage.tsx
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import AssignLeadModal from '../components/AssignLeadModal'
import EventModal from '../components/EventModal'
import CompletionChecklist from '../components/CompletionChecklist'
import ReviewRequestModal from '../components/ReviewRequestModal'
import QuoteComposerModal from '../components/QuoteComposerModal'
import { UserPlus, Inbox, Plus } from 'lucide-react'
import AddLeadModal from '../components/AddLeadModal'
import EmailParser from '../components/EmailParser'
import LeadCard, { type KanbanLead } from '../components/LeadCard'
import LeadDetailSheet from '../components/LeadDetailSheet'
import {
  getColumnsForTab,
  getDefaultMobileTab,
  getKanbanColumns,
  getMobileTabs,
  isLeadVisibleInActiveKanban,
  mobileTabForStatus,
  type KanbanColumnDef,
  type LeadsMobileTab,
} from '../lib/leadsKanban'
import { buildPoolPickupUpdate, shouldPoolPickup, type PoolPickupSource } from '../lib/leadPoolPickup'
import { isReviewRequestEligible, sendReviewRequestSms } from '../lib/reviewRequest'
import { getOnTheWayBlockReason, buildOnTheWayMessage, openOnTheWaySms } from '../lib/onTheWaySms'
import { logLeadEvent as recordLeadEvent } from '../lib/leadEvents'
import { formatAuPhoneForSms } from '../lib/phone'
import type { LeadEventType } from '../lib/leadEventPayload'
import { useOrgProfiles } from '../hooks/useOrgProfiles'
import { isManagerRole } from '../lib/roles'
import {
  buildContactAttemptUpdate,
  processContactFollowUpRollovers,
  sortLeadsForKanbanColumn,
  LOST_REASON_UNABLE_TO_CONTACT,
} from '../lib/contactFollowUp'

// ── Types ───────────────────────────────────────────────────────────────────

type Lead = KanbanLead

interface LeadInvoiceSummary {
  lead_id: string
  id: string
  status: string
  invoice_number: string
  created_at: string
}

interface LeadQuoteSummary {
  lead_id: string
  status: string
  accepted_at: string | null
  created_at: string
}

// ── Drag-and-drop: Droppable Column Wrapper (desktop only) ───────────────

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 transition-colors duration-150 ${isOver ? 'bg-blue-50 rounded-xl' : ''}`}
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

// ── KanbanColumn — Mobile (no drag wrappers) ─────────────────────────────

interface KanbanColumnProps {
  col: KanbanColumnDef
  leads: Lead[]
  profile: { role: string; id: string; org_id?: string } | null
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
  onCall: (lead: Lead) => void
  hideAssignPool?: boolean
}

function MobileKanbanColumn({ col, leads, profile, expandedLead, onToggleExpand, onOpenSheet, onAssign, onBook, onCreateQuote, quoteEnabled, onComplete, onRefresh, onLogEvent, onCall, hideAssignPool }: KanbanColumnProps) {
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
            onCall={onCall}
            hideAssignPool={hideAssignPool}
          />
        ))}
      </div>
    </div>
  )
}

// ── KanbanColumn — Desktop (drag wrappers active) ────────────────────────

function DesktopKanbanColumn({ col, leads, profile, expandedLead, onToggleExpand, onOpenSheet, onAssign, onBook, onCreateQuote, quoteEnabled, onComplete, onRefresh, onLogEvent, onCall, hideAssignPool }: KanbanColumnProps) {
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
                onCall={onCall}
                hideAssignPool={hideAssignPool}
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
  const [searchParams] = useSearchParams()
  const { fetchOrgProfiles } = useOrgProfiles()
  const { org, brand, isFeatureEnabled, featureSwitchesLoading, isSoloMode } = useOrg()
  const kanbanColumns = getKanbanColumns(isSoloMode)
  const mobileTabs = getMobileTabs(isSoloMode)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showAddLead, setShowAddLead] = useState(false)
  const [showPasteEnquiry, setShowPasteEnquiry] = useState(false)
  const [assigningLead, setAssigningLead] = useState<Lead | null>(null)
  const [bookingLead, setBookingLead] = useState<Lead | null>(null)
  const [orgEmployees, setOrgEmployees] = useState<{ id: string; full_name: string; phone?: string | null }[]>([])
  const [expandedLead, setExpandedLead] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<LeadsMobileTab>(() => getDefaultMobileTab(false))
  const [sheetLead, setSheetLead] = useState<Lead | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetHistoryPushed = useRef(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [checklistLead, setChecklistLead] = useState<Lead | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [reviewModalLead, setReviewModalLead] = useState<Lead | null>(null)
  const [quoteLead, setQuoteLead] = useState<Lead | null>(null)
  const [reviewSending, setReviewSending] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const quoteFeatureEnabled = !featureSwitchesLoading && isFeatureEnabled('quote_esign')
  const reviewFeatureEnabled = !featureSwitchesLoading && isFeatureEnabled('review_requests')
  const onTheWayFeatureEnabled = !featureSwitchesLoading && isFeatureEnabled('customer_ontheway_sms')

  const fetchLeads = useCallback(async () => {
    if (!profile?.org_id) return

    let query = supabase
      .from('leads')
      .select('*, profiles(full_name, avatar_url)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (profile?.role === 'employee') {
      query = query.or(`status.eq.unassigned,assigned_to.eq.${profile.id}`)
    }

    const { data, error } = await query
    if (error) {
      console.error('fetchLeads failed:', error.message)
      setFetchError('Could not load leads. Please refresh the page.')
      setLoading(false)
      return
    }
    setFetchError(null)
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

      let invoiceRows: LeadInvoiceSummary[] = []
      try {
        const invoicesRes = await supabase
          .from('invoices')
          .select('lead_id, id, status, invoice_number, created_at')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false })
        if (!invoicesRes.error && invoicesRes.data) {
          invoiceRows = invoicesRes.data as LeadInvoiceSummary[]
        } else if (invoicesRes.error) {
          console.warn('Invoices table unavailable; skipping invoice card state.', invoicesRes.error.message)
        }
      } catch (err) {
        console.warn('Invoices fetch skipped:', err)
      }

      const latestInvoiceByLead = new Map<string, LeadInvoiceSummary>()
      for (const row of invoiceRows) {
        if (!latestInvoiceByLead.has(row.lead_id)) {
          latestInvoiceByLead.set(row.lead_id, row)
        }
      }

      const merged = baseLeads.map((lead) => {
        const latestQuote = latestQuoteByLead.get(lead.id)
        const latestInvoice = latestInvoiceByLead.get(lead.id)
        return {
          ...lead,
          latest_quote_status: latestQuote?.status ?? null,
          latest_quote_accepted_at: latestQuote?.accepted_at ?? null,
          latest_invoice_status: latestInvoice?.status ?? null,
          latest_invoice_id: latestInvoice?.id ?? null,
          latest_invoice_number: latestInvoice?.invoice_number ?? null,
        }
      })

      let withFollowUp = merged
      if (profile?.org_id && profile?.id) {
        withFollowUp = await processContactFollowUpRollovers(
          merged,
          async (leadId, update) => {
            const { error } = await supabase.from('leads').update(update).eq('id', leadId)
            return !error
          },
          async (leadId, eventType, note, payload) => {
            await recordLeadEvent({
              leadId,
              orgId: profile.org_id!,
              eventType,
              note,
              actorId: profile.id,
              payload,
            })
          }
        )
      }

      setLeads(withFollowUp)
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

  const logPoolPickup = useCallback(async (leadId: string, source: PoolPickupSource) => {
    if (!profile?.org_id || !profile?.id) return
    await logLeadEvent(leadId, 'assigned', 'Lead picked up from pool', {
      assigned_to: profile.id,
      source,
    })
  }, [logLeadEvent, profile?.id, profile?.org_id])

  const focusMobileTabForStatus = useCallback((status: string) => {
    setActiveTab(mobileTabForStatus(status, isSoloMode))
  }, [isSoloMode])

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

    const updatePayload: Record<string, unknown> = { status: newStatus }

    if (newStatus === 'unassigned') {
      updatePayload.assigned_to = null
      updatePayload.assigned_at = null
      updatePayload.timer_expires_at = null
      updatePayload.contact_attempt_round = 0
      updatePayload.last_contact_attempted_at = null
      updatePayload.lost_reason = null
    }

    if (newStatus === 'contact_attempted') {
      const attempt = buildContactAttemptUpdate(lead)
      if (attempt.kind === 'unable_to_contact') {
        const confirmed = window.confirm(
          `${lead.name} has had 5 contact attempts.\n\nMark as lost (unable to contact)?`
        )
        if (!confirmed) return
      }
      Object.assign(updatePayload, attempt.update)
    } else if (newStatus === 'assigned' && lead.status === 'unassigned') {
      updatePayload.contact_attempt_round = 0
      updatePayload.last_contact_attempted_at = null
      updatePayload.lost_reason = null
    }

    Object.assign(
      updatePayload,
      buildPoolPickupUpdate(lead.status, newStatus, profile?.id)
    )

    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...updatePayload } : l))

    const { error } = await supabase.from('leads').update(updatePayload).eq('id', leadId)
    if (error) {
      fetchLeads()
    } else {
      if (shouldPoolPickup(lead.status, newStatus, profile?.id)) {
        await logPoolPickup(leadId, 'drag')
      }
      await logLeadEvent(
        leadId,
        updatePayload.status === 'lost'
          ? 'lost'
          : newStatus === 'contact_attempted' ||
          newStatus === 'booked' ||
          newStatus === 'lost' ||
          newStatus === 'completed' ||
          newStatus === 'expired'
          ? (newStatus as LeadEventType)
          : 'status_change',
        updatePayload.status === 'lost' && updatePayload.lost_reason
          ? `Marked lost — unable to contact`
          : `Status changed from ${lead.status} to ${String(updatePayload.status ?? newStatus)} via drag`,
        {
          from_status: lead.status,
          to_status: String(updatePayload.status ?? newStatus),
          source: 'drag',
          ...(updatePayload.lost_reason ? { reason: updatePayload.lost_reason } : {}),
        }
      )
      if (newStatus === 'completed') {
        const eligible = await isReviewRequestEligible(org, lead, profile?.org_id, reviewFeatureEnabled)
        if (eligible) {
          setReviewModalLead(lead)
        }
      }
      if (shouldPoolPickup(lead.status, newStatus, profile?.id)) {
        focusMobileTabForStatus(newStatus)
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
    if (typeof window !== 'undefined' && window.innerWidth < 768 && !sheetHistoryPushed.current) {
      window.history.pushState({ leadDetailSheet: true }, '')
      sheetHistoryPushed.current = true
    }
  }, [])

  const closeSheet = useCallback((fromHistory = false) => {
    setSheetOpen(false)
    setTimeout(() => setSheetLead(null), 300)
    if (fromHistory) {
      sheetHistoryPushed.current = false
      return
    }
    if (sheetHistoryPushed.current) {
      sheetHistoryPushed.current = false
      window.history.back()
    }
  }, [])

  useEffect(() => {
    if (!sheetOpen) return

    function onPopState() {
      if (sheetHistoryPushed.current) {
        closeSheet(true)
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [sheetOpen, closeSheet])

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
    const attempt = buildContactAttemptUpdate(lead)

    if (attempt.kind === 'unable_to_contact') {
      const confirmed = window.confirm(
        `${lead.name} has had 5 contact attempts.\n\nMark as lost (unable to contact)?`
      )
      if (!confirmed) return
      await supabase.from('leads').update(attempt.update).eq('id', lead.id)
      await logLeadEvent(lead.id, 'lost', 'Unable to contact', {
        from_status: lead.status,
        to_status: 'lost',
        reason: LOST_REASON_UNABLE_TO_CONTACT,
        source: 'max_attempts',
      })
      closeSheet()
      fetchLeads()
      return
    }

    const toStatus = 'contact_attempted'
    const poolPickup = shouldPoolPickup(lead.status, toStatus, profile?.id)
    const confirmed = window.confirm(
      poolPickup
        ? `Call ${lead.name}?\n\nThis will assign the lead to you and mark it Contact Attempted.`
        : `Call ${lead.name}?\n\nThis will update the lead status to "Contact Attempted".`
    )
    if (!confirmed) return

    const updatePayload = {
      ...attempt.update,
      ...(poolPickup ? buildPoolPickupUpdate(lead.status, toStatus, profile?.id) : {}),
    }
    await supabase.from('leads').update(updatePayload).eq('id', lead.id)

    if (poolPickup) {
      await logPoolPickup(lead.id, 'call_auto_assign')
    }
    await logLeadEvent(
      lead.id,
      'call_attempted',
      `Called ${lead.phone}`,
      {
        from_status: lead.status,
        to_status: toStatus,
        channel: 'phone',
      }
    )
    window.location.href = `tel:${lead.phone}`
    closeSheet()
    focusMobileTabForStatus(toStatus)
    fetchLeads()
  }, [logLeadEvent, logPoolPickup, closeSheet, fetchLeads, focusMobileTabForStatus, profile?.id])

  const handleSMS = useCallback(async (lead: Lead) => {
    if (!lead.phone?.trim()) {
      alert('No phone number saved for this lead.')
      return
    }

    const blockReason = getOnTheWayBlockReason(lead, onTheWayFeatureEnabled)
    if (blockReason) {
      alert(blockReason)
      return
    }

    const attempt = buildContactAttemptUpdate(lead)

    if (attempt.kind === 'unable_to_contact') {
      const confirmed = window.confirm(
        `${lead.name} has had 5 contact attempts.\n\nMark as lost (unable to contact)?`
      )
      if (!confirmed) return
      await supabase.from('leads').update(attempt.update).eq('id', lead.id)
      await logLeadEvent(lead.id, 'lost', 'Unable to contact', {
        from_status: lead.status,
        to_status: 'lost',
        reason: LOST_REASON_UNABLE_TO_CONTACT,
        source: 'max_attempts',
      })
      closeSheet()
      fetchLeads()
      return
    }

    const toStatus = 'contact_attempted'
    const poolPickup = shouldPoolPickup(lead.status, toStatus, profile?.id)

    if (poolPickup) {
      const updatePayload = {
        ...attempt.update,
        ...buildPoolPickupUpdate(lead.status, toStatus, profile?.id),
      }
      await supabase.from('leads').update(updatePayload).eq('id', lead.id)
      await logPoolPickup(lead.id, 'sms_auto_assign')
    } else if (lead.status === 'assigned' || lead.status === 'contact_attempted') {
      await supabase.from('leads').update(attempt.update).eq('id', lead.id)
    }

    const techName = profile?.full_name ?? 'Your technician'
    const message = buildOnTheWayMessage(lead, techName, org, brand)
    const to = formatAuPhoneForSms(lead.phone.trim())

    await logLeadEvent(
      lead.id,
      'sms_attempted',
      `Opened SMS to ${to}`,
      {
        channel: 'sms',
        phone: to,
        template: 'customer_ontheway',
        from_device: true,
        from_status: lead.status,
        to_status: poolPickup || lead.status === 'assigned' ? toStatus : lead.status,
      }
    )

    openOnTheWaySms(lead.phone, message)
    closeSheet()
    if (poolPickup || lead.status === 'assigned' || lead.status === 'contact_attempted') {
      focusMobileTabForStatus(toStatus)
      fetchLeads()
    }
  }, [brand, closeSheet, fetchLeads, focusMobileTabForStatus, logLeadEvent, logPoolPickup, onTheWayFeatureEnabled, org, profile?.full_name, profile?.id])

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
    const attempt = buildContactAttemptUpdate(lead)

    if (attempt.kind === 'unable_to_contact') {
      const confirmed = window.confirm(
        `${lead.name} has had 5 contact attempts.\n\nMark as lost (unable to contact)?`
      )
      if (!confirmed) return
      await supabase.from('leads').update(attempt.update).eq('id', lead.id)
      await logLeadEvent(lead.id, 'lost', 'Unable to contact', {
        from_status: lead.status,
        to_status: 'lost',
        reason: LOST_REASON_UNABLE_TO_CONTACT,
        source: 'max_attempts',
      })
      fetchLeads()
      return
    }

    const toStatus = 'contact_attempted'
    const poolPickup = shouldPoolPickup(lead.status, toStatus, profile?.id)
    const updatePayload = {
      ...attempt.update,
      ...(poolPickup ? buildPoolPickupUpdate(lead.status, toStatus, profile?.id) : {}),
    }
    await supabase.from('leads').update(updatePayload).eq('id', lead.id)

    if (poolPickup) {
      await logPoolPickup(lead.id, 'manual_contact')
    }
    await logLeadEvent(
      lead.id,
      'contact_attempted',
      'Status updated to Contact Attempted',
      {
        from_status: lead.status,
        to_status: toStatus,
        source: 'manual_action',
      }
    )
    focusMobileTabForStatus(toStatus)
    fetchLeads()
    closeSheet()
  }, [logLeadEvent, logPoolPickup, fetchLeads, closeSheet, focusMobileTabForStatus, profile?.id])

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
        contact_attempt_round: 0,
        last_contact_attempted_at: null,
        lost_reason: null,
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

  useEffect(() => {
    if (!sheetLead) return
    const fresh = leads.find((l) => l.id === sheetLead.id)
    if (fresh) setSheetLead(fresh)
  }, [leads, sheetLead?.id])

  useEffect(() => {
    setActiveTab(getDefaultMobileTab(isSoloMode))
  }, [isSoloMode, org?.id])

  useEffect(() => {
    if (loading) return

    const statusParam = searchParams.get('status')
    const highlightId = searchParams.get('highlight')

    if (statusParam) {
      if (isSoloMode) {
        if (statusParam === 'inbox' || statusParam === 'active' || statusParam === 'done') {
          setActiveTab(statusParam)
        } else {
          setActiveTab(mobileTabForStatus(statusParam, true))
        }
      } else if (
        statusParam === 'unassigned' ||
        statusParam === 'assigned' ||
        statusParam === 'contact' ||
        statusParam === 'closed'
      ) {
        setActiveTab(statusParam)
      } else {
        setActiveTab(mobileTabForStatus(statusParam, false))
      }
    }

    if (highlightId) {
      const highlighted = leads.find((l) => l.id === highlightId)
      if (highlighted) {
        setActiveTab(mobileTabForStatus(highlighted.status, isSoloMode))
        requestAnimationFrame(() => {
          document.getElementById(`lead-card-${highlightId}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          })
        })
      }
    }
  }, [searchParams, leads, loading, isSoloMode])

  useEffect(() => {
    if (!profile?.org_id || !isManagerRole(profile.role)) return
    fetchOrgProfiles({ roles: ['employee', 'manager', 'platform_admin'] }).then((data) => {
      setOrgEmployees(data.map((p) => ({ id: p.id, full_name: p.full_name, phone: p.phone })))
    })
  }, [profile?.org_id, profile?.role, fetchOrgProfiles])

  function leadsForColumn(status: string) {
    const filtered = leads.filter(
      (lead) => lead.status === status && isLeadVisibleInActiveKanban(lead.status, lead.hidden_from_kanban_at)
    )
    return sortLeadsForKanbanColumn(filtered, status)
  }

  const activeDragLead = activeDragId ? leads.find(l => l.id === activeDragId) : null
  const visibleKanbanColumns = isSoloMode
    ? kanbanColumns.filter((col) => getColumnsForTab(activeTab, isSoloMode).includes(col.key))
    : kanbanColumns

  const columnProps = (col: KanbanColumnDef) => ({
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
    onCall: handleCall,
    hideAssignPool: isSoloMode,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {showChecklist && checklistLead && (
        <CompletionChecklist
          lead={checklistLead}
          onComplete={confirmComplete}
          onCancel={() => { setShowChecklist(false); setChecklistLead(null) }}
          logEvent={async (id, note, eventType) => {
            await logLeadEvent(id, (eventType ?? 'review_request') as LeadEventType, note)
          }}
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
      {assigningLead && !isSoloMode && (
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
          employees={isManagerRole(profile?.role) ? orgEmployees : undefined}
          defaultAssigneeId={bookingLead.assigned_to ?? profile?.id}
          prefillLead={{
            id: bookingLead.id,
            name: bookingLead.name,
            phone: bookingLead.phone,
            email: bookingLead.email,
            address: bookingLead.address,
            details: bookingLead.details,
            service_type: bookingLead.service_type,
            assigned_to: bookingLead.assigned_to ?? undefined,
          }}
          onClose={() => setBookingLead(null)}
          onSaved={fetchLeads}
        />
      )}

      <NavBar />

      <main className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Leads</h2>
            {!isSoloMode && (
              <p className="text-gray-500 text-sm mt-1">
                Manage and track all leads across every stage.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPasteEnquiry(true)}
              className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-[#004B93] border border-[#004B93]/30 hover:bg-[#004B93]/5 transition"
            >
              Paste enquiry
            </button>
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

        {showPasteEnquiry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-4">
              <EmailParser
                embedded
                onClose={() => setShowPasteEnquiry(false)}
                onLeadSaved={() => {
                  setShowPasteEnquiry(false)
                  fetchLeads()
                }}
              />
            </div>
          </div>
        )}

        {loading && <p className="text-gray-400 text-sm">Loading leads...</p>}

        {fetchError && !loading && (
          <p className="text-red-600 text-sm mb-3">{fetchError}</p>
        )}

        {!loading && (
          <>
            {/* ── Mobile View ── */}
            <div className="md:hidden">
              <div className="sticky top-0 z-10 bg-white border-b border-gray-200 flex mb-3 -mx-4 px-0">
                {mobileTabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as LeadsMobileTab)}
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
                {(isSoloMode ? visibleKanbanColumns : kanbanColumns.filter(col => getColumnsForTab(activeTab, isSoloMode).includes(col.key)))
                  .map(col => (
                    <MobileKanbanColumn key={col.key} {...columnProps(col)} />
                  ))}
              </div>
            </div>

            {/* ── Desktop View ── */}
            <div className="hidden md:block">
              {isSoloMode && (
                <div className="flex border-b border-gray-200 mb-4 max-w-2xl">
                  {mobileTabs.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as LeadsMobileTab)}
                      className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                        activeTab === tab.key
                          ? 'text-[#004B93] border-b-2 border-[#004B93]'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
              {isSoloMode ? (
                <div className="max-w-2xl space-y-4">
                  {visibleKanbanColumns.map(col => (
                    <MobileKanbanColumn key={col.key} {...columnProps(col)} />
                  ))}
                </div>
              ) : (
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {kanbanColumns.map(col => (
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
              )}
            </div>
          </>
        )}
      </main>

      {sheetOpen && window.innerWidth < 768 && sheetLead && (
        <LeadDetailSheet
          lead={sheetLead}
          isOpen={sheetOpen}
          onClose={() => closeSheet()}
          profile={profile}
          onCall={handleCall}
          onSms={handleSMS}
          onAssign={(lead) => { setAssigningLead(lead); closeSheet() }}
          onBook={(lead) => { setBookingLead(lead); closeSheet() }}
          onQuote={(lead) => { setQuoteLead(lead); closeSheet() }}
          onMarkContactAttempted={handleMarkContactAttempted}
          onUnassign={handleUnassign}
          onComplete={handleMarkComplete}
          onSharePhoto={handleSharePhoto}
          quoteEnabled={quoteFeatureEnabled}
          smsEnabled={onTheWayFeatureEnabled}
          hideAssignPool={isSoloMode}
          onRefresh={fetchLeads}
        />
      )}
    </div>
  )
}