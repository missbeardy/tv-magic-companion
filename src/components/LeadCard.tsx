import { useEffect, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import CountdownTimer from './CountdownTimer'
import LeadStatusMenu from './LeadStatusMenu'
import LeadPhotos from './LeadPhotos'
import LeadExtractedSummary, { LeadRawSource, type LeadSummaryFields } from './LeadExtractedSummary'
import UnassignedTimer from './UnassignedTimer'
import ContactFollowUpBadge from './ContactFollowUpBadge'
import LeadAssigneeAvatars from './LeadAssigneeAvatars'
import LeadAddressEditor from './LeadAddressEditor'
import LeadContactNote from './LeadContactNote'
import { formatLocalityLabelFromAddress } from '../lib/extractSuburb'
import { getAttemptPhaseLabel, LOST_REASON_UNABLE_TO_CONTACT } from '../lib/contactFollowUp'
import { isManagerRole } from '../lib/roles'
import { markInvoicePaid } from '../lib/invoices'
import type { LeadEventType } from '../lib/leadEventPayload'
import { resolveLeadNextAction } from '../lib/leadNextAction'

export interface KanbanLead {
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
  last_contact_attempted_at?: string | null
  last_manual_sms_text?: string | null
  last_manual_sms_at?: string | null
  contact_attempt_round?: number | null
  lost_reason?: string | null
  assigned_to: string | null
  customer_id?: string | null
  address: string | undefined
  review_request_sent_at?: string | null
  lead_source?: string | null
  raw_email?: string | null
  raw_sms?: string | null
  extraction_status?: string | null
  hidden_from_kanban_at?: string | null
  latest_quote_status?: string | null
  latest_quote_accepted_at?: string | null
  latest_quote_total_amount?: number | null
  latest_invoice_status?: string | null
  latest_invoice_id?: string | null
  latest_invoice_number?: string | null
  profiles: { full_name: string; avatar_url?: string | null } | null
}

interface LeadEvent {
  id: string
  event_type: string
  note: string | null
  created_at: string
}

export interface LeadCardProps {
  lead: KanbanLead
  profile: { role: string; id: string; org_id?: string } | null
  expandedLead: string | null
  onToggleExpand: (leadId: string | null) => void
  onOpenSheet: (lead: KanbanLead) => void
  onAssign: (lead: KanbanLead) => void
  onBook: (lead: KanbanLead) => void
  onCreateQuote: (lead: KanbanLead) => void
  quoteEnabled: boolean
  onComplete: (lead: KanbanLead) => void
  onRefresh: () => void
  onLogEvent: (leadId: string, eventType: LeadEventType, note?: string, payload?: Record<string, unknown>) => Promise<void>
  onCall: (lead: KanbanLead) => void
  hideAssignPool?: boolean
}

export default function LeadCard({
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
  onCall,
  hideAssignPool = false,
}: LeadCardProps) {
  const isExpanded = expandedLead === lead.id
  const isBookingCancelled = lead.status === 'booking_cancelled'
  const isQuoteAccepted = lead.latest_quote_status === 'accepted'
  const invoiceStatus = lead.latest_invoice_status
  const locality = formatLocalityLabelFromAddress(lead.address)
  const attemptPhaseLabel = getAttemptPhaseLabel(lead.contact_attempt_round)
  const isUnableToContact =
    lead.status === 'lost' && lead.lost_reason === LOST_REASON_UNABLE_TO_CONTACT
  const [markingPaid, setMarkingPaid] = useState(false)
  const [events, setEvents] = useState<LeadEvent[]>([])

  const nextAction = resolveLeadNextAction({
    status: lead.status,
    latestQuoteStatus: lead.latest_quote_status,
    quoteEnabled,
    hideAssignPool,
    isManager: isManagerRole(profile?.role),
    isEmployee: profile?.role === 'employee',
  })

  function runNextAction(e: React.MouseEvent) {
    e.stopPropagation()
    if (!nextAction) return
    switch (nextAction.kind) {
      case 'assign':
      case 'self_assign':
        onAssign(lead)
        break
      case 'call':
        onCall(lead)
        break
      case 'quote':
        onCreateQuote(lead)
        break
      case 'book':
        onBook(lead)
        break
      case 'complete':
        onComplete(lead)
        break
    }
  }

  const assignees =
    lead.status !== 'unassigned' && lead.profiles && lead.assigned_to
      ? [
          {
            id: lead.assigned_to,
            full_name: lead.profiles.full_name,
            avatar_url: lead.profiles.avatar_url,
          },
        ]
      : []

  async function handleMarkInvoicePaid() {
    if (!lead.latest_invoice_id) return
    setMarkingPaid(true)
    try {
      await markInvoicePaid(lead.latest_invoice_id)
      await onLogEvent(
        lead.id,
        'invoice_paid_manual',
        `Invoice ${lead.latest_invoice_number ?? ''} marked paid`.trim()
      )
      onRefresh()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to mark paid')
    } finally {
      setMarkingPaid(false)
    }
  }

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
      id={`lead-card-${lead.id}`}
      className={`rounded-xl border shadow-sm overflow-hidden cursor-pointer md:cursor-default ${
        isBookingCancelled
          ? 'bg-red-50 border-red-200'
          : isQuoteAccepted
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-white border-gray-100'
      }`}
      onClick={() => {
        if (window.innerWidth < 768) {
          onOpenSheet(lead)
        }
      }}
    >
      <div className="p-3">
        {(invoiceStatus === 'sent' || invoiceStatus === 'paid' || isUnableToContact || lead.last_manual_sms_at) && (
          <div className="flex flex-wrap gap-1 mb-2">
            {isUnableToContact && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-red-700">
                Unable to contact
              </span>
            )}
            {lead.last_manual_sms_at && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-red-600">
                SMS sent
              </span>
            )}
            {invoiceStatus === 'sent' && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-violet-700">
                Invoice sent
              </span>
            )}
            {invoiceStatus === 'paid' && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-green-700">
                Invoice paid
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <p
            className={`flex-1 min-w-0 font-bold text-[15px] truncate ${
              isBookingCancelled ? 'text-red-900' : isQuoteAccepted ? 'text-emerald-900' : 'text-gray-800'
            }`}
          >
            {lead.name || 'Unknown'}
          </p>
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
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
              contactAttemptRound={lead.contact_attempt_round}
            />
          </div>
          <ChevronUp size={16} className="md:hidden text-gray-400 shrink-0" aria-hidden />
        </div>

        <div className="mt-1.5">
          <span className="text-xs text-gray-500">{lead.service_type}</span>
          {locality && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">📍 {locality}</p>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 min-h-[24px]">
          {lead.status === 'unassigned' ? (
            <UnassignedTimer createdAt={lead.created_at} />
          ) : lead.status === 'contact_attempted' ? (
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <ContactFollowUpBadge lastAttemptAt={lead.last_contact_attempted_at} />
              <LeadAssigneeAvatars assignees={assignees} />
            </div>
          ) : (
            <LeadAssigneeAvatars assignees={assignees} />
          )}
          {attemptPhaseLabel && lead.status === 'contact_attempted' && (
            <span className={`text-xs font-semibold shrink-0 ${
              (lead.contact_attempt_round ?? 0) >= 3 ? 'text-red-700' : 'text-red-600'
            }`}>
              {attemptPhaseLabel}
            </span>
          )}
          {!isBookingCancelled && isQuoteAccepted && (
            <span className="text-xs text-emerald-700">Quote accepted</span>
          )}
        </div>

        {lead.timer_expires_at && lead.status === 'assigned' && (
          <div className="mt-2">
            <CountdownTimer expiresAt={lead.timer_expires_at} showPoolHint />
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {nextAction && (
            <button
              type="button"
              onClick={runNextAction}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition opacity-95 hover:opacity-100 ${nextAction.className}`}
            >
              {nextAction.label}
            </button>
          )}
          {lead.lead_source && (
            <span className="inline-block text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">
              {lead.lead_source}
            </span>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand(isExpanded ? null : lead.id) }}
          className="hidden md:block text-xs text-gray-400 hover:text-gray-600 mt-2 transition"
        >
          {isExpanded ? '▲ Less' : '▼ More'}
        </button>

        {isExpanded && (
          <div className="hidden md:block mt-2 space-y-2 border-t border-gray-100 pt-2">
            {profile?.org_id && (
              <LeadAddressEditor
                leadId={lead.id}
                address={lead.address}
                orgId={profile.org_id}
                actorId={profile.id}
                onSaved={onRefresh}
                variant="card"
              />
            )}
            <LeadExtractedSummary lead={lead} size="sm" showAddress={false} onPhoneClick={onCall as (lead: LeadSummaryFields) => void} />
            <LeadRawSource lead={lead} />

            {lead.last_manual_sms_text && (
              <div className="rounded-lg bg-red-50 border border-red-100 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 mb-0.5">SMS sent</p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap">{lead.last_manual_sms_text}</p>
              </div>
            )}

            {lead.status === 'contact_attempted' && profile?.org_id && (
              <LeadContactNote
                leadId={lead.id}
                orgId={profile.org_id}
                actorId={profile.id}
                onSaved={() => {
                  supabase
                    .from('lead_events')
                    .select('*')
                    .eq('lead_id', lead.id)
                    .order('created_at', { ascending: false })
                    .limit(5)
                    .then(({ data }) => setEvents((data as LeadEvent[]) ?? []))
                }}
              />
            )}

            <div className="flex flex-wrap gap-1 mt-2">
              {lead.status === 'unassigned' && !hideAssignPool && isManagerRole(profile?.role) && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAssign(lead) }}
                  className="text-xs btn-primary px-2 py-1 rounded-lg transition"
                >
                  Assign
                </button>
              )}
              {lead.status === 'unassigned' && !hideAssignPool && profile?.role === 'employee' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAssign(lead) }}
                  className="text-xs btn-secondary px-2 py-1 rounded-lg transition"
                >
                  Self-Assign
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onBook(lead) }}
                className="text-xs btn-secondary px-2 py-1 rounded-lg transition"
              >
                📅 Book
              </button>
              {isManagerRole(profile?.role) && quoteEnabled && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCreateQuote(lead) }}
                  className="text-xs bg-gray-900 text-white px-2 py-1 rounded-lg hover:bg-black transition"
                >
                  🧾 Quote
                </button>
              )}
            </div>

            {lead.status === 'completed' && (
              <LeadPhotos leadId={lead.id} canUpload={true} />
            )}

            {invoiceStatus === 'sent' && lead.latest_invoice_id && isManagerRole(profile?.role) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleMarkInvoicePaid() }}
                disabled={markingPaid}
                className="mt-2 text-xs px-2 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {markingPaid ? 'Saving…' : 'Mark invoice paid'}
              </button>
            )}

            {events.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-3 space-y-1">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Activity</p>
                {events.map((ev) => (
                  <p key={ev.id} className="text-xs text-gray-500">
                    {new Date(ev.created_at).toLocaleString()} — {ev.note ?? ev.event_type}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
