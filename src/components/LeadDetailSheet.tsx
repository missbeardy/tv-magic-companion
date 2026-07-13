import { useState } from 'react'
import {
  MapPin,
  UserPlus,
  Calendar,
  Navigation,
  FileText,
  ChevronRight,
  History,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import BottomSheet from './BottomSheet'
import CustomerHistorySheet from './CustomerHistorySheet'
import SmsComposeModal from './SmsComposeModal'
import LeadPhotos from './LeadPhotos'
import LeadAddressEditor from './LeadAddressEditor'
import LeadContactEditor from './LeadContactEditor'
import LeadContactNote from './LeadContactNote'
import DeleteLeadModal from './DeleteLeadModal'
import { LeadRawSource } from './LeadExtractedSummary'
import { formatLocalityLabelFromAddress } from '../lib/extractSuburb'
import { getAttemptPhaseLabel, LOST_REASON_UNABLE_TO_CONTACT } from '../lib/contactFollowUp'
import { getLeadDisplayDetails } from '../lib/leadDisplay'
import { isManagerRole } from '../lib/roles'
import { getAuthHeaders } from '../lib/apiAuth'
import type { KanbanLead } from './LeadCard'

interface Props {
  lead: KanbanLead
  isOpen: boolean
  onClose: () => void
  profile: { role: string; id: string; org_id?: string } | null
  onCall: (lead: KanbanLead) => void
  onSms: (lead: KanbanLead) => void
  onSendManualSms: (lead: KanbanLead, text: string) => void
  onAssign: (lead: KanbanLead) => void
  onBook: (lead: KanbanLead) => void
  onQuote: (lead: KanbanLead) => void
  onUnassign: (lead: KanbanLead) => void
  onComplete: (lead: KanbanLead) => void
  onSharePhoto: (lead: KanbanLead) => void
  quoteEnabled: boolean
  smsEnabled: boolean
  customerProfilesEnabled?: boolean
  hideAssignPool?: boolean
  onRefresh: () => void
  onDeleted?: () => void
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  showChevron = true,
}: {
  icon: typeof MapPin
  label: string
  onClick: () => void
  showChevron?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 min-h-[44px] px-1 text-left hover:bg-gray-50 transition-colors"
    >
      <Icon size={20} className="shrink-0 text-[var(--color-primary)]" />
      <span className="flex-1 text-sm text-gray-800">{label}</span>
      {showChevron && <ChevronRight size={16} className="text-gray-300 shrink-0" />}
    </button>
  )
}

export default function LeadDetailSheet({
  lead,
  isOpen,
  onClose,
  profile,
  onCall,
  onSms,
  onSendManualSms,
  onAssign,
  onBook,
  onQuote,
  onUnassign,
  onComplete,
  onSharePhoto,
  quoteEnabled,
  smsEnabled,
  customerProfilesEnabled = false,
  hideAssignPool = false,
  onRefresh,
  onDeleted,
}: Props) {
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState('')

  const locality = formatLocalityLabelFromAddress(lead.address)
  const attemptPhaseLabel = getAttemptPhaseLabel(lead.contact_attempt_round)
  const isUnableToContact =
    lead.status === 'lost' && lead.lost_reason === LOST_REASON_UNABLE_TO_CONTACT
  const summary = getLeadDisplayDetails(lead)
  const summaryLong = (summary?.length ?? 0) > 140
  const isCompleted = lead.status === 'completed'
  const isUnassigned = lead.status === 'unassigned'

  function primaryAction() {
    if (isCompleted) return null
    if (isUnassigned) {
      if (hideAssignPool) return null
      if (isManagerRole(profile?.role)) {
        return { label: 'Assign to Technician', onClick: () => onAssign(lead), className: 'bg-brand text-white' }
      }
      if (profile?.role === 'employee') {
        return { label: 'Self-Assign This Lead', onClick: () => onAssign(lead), className: 'bg-brand text-white' }
      }
    }
    return { label: 'Complete Job', onClick: () => onComplete(lead), className: 'bg-green-600 text-white' }
  }

  const primary = primaryAction()

  const extractionStatus = lead.extraction_status ?? null
  const showExtractionBadge =
    isManagerRole(profile?.role) &&
    (extractionStatus === 'failed' ||
      extractionStatus === 'fallback' ||
      extractionStatus === 'pending')
  const canRetryExtraction =
    isManagerRole(profile?.role) &&
    (lead.raw_sms || lead.raw_email) &&
    extractionStatus !== 'succeeded'

  async function handleRetryExtraction() {
    setRetrying(true)
    setRetryError('')
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/leads?action=retry-extraction', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRetryError(data.error ?? 'Retry failed')
        setRetrying(false)
        return
      }
      onRefresh()
    } catch {
      setRetryError('Retry failed')
    } finally {
      setRetrying(false)
    }
  }

  function extractionBadgeLabel(): string {
    if (extractionStatus === 'failed') return 'Extraction failed'
    if (extractionStatus === 'fallback') return 'Fallback extraction'
    return 'Extraction pending'
  }

  function extractionBadgeClass(): string {
    if (extractionStatus === 'failed') return 'bg-red-50 text-red-700 border-red-100'
    if (extractionStatus === 'fallback') return 'bg-amber-50 text-amber-800 border-amber-100'
    return 'bg-gray-50 text-gray-600 border-gray-100'
  }

  return (
    <>
    <BottomSheet isOpen={isOpen} onClose={onClose} hideHeader showCloseButton footer={primary ? (
      <button
        type="button"
        onClick={primary.onClick}
        className={`w-full py-3.5 rounded-xl font-semibold text-base ${primary.className}`}
      >
        {primary.label}
      </button>
    ) : undefined}
    >
      <div className="space-y-4 pb-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{lead.name || 'Unknown'}</h2>
          {isUnableToContact && (
            <p className="text-xs font-semibold text-red-600 mt-1">Unable to contact</p>
          )}
          {attemptPhaseLabel && lead.status === 'contact_attempted' && (
            <p className="text-xs font-semibold text-red-600 mt-1">{attemptPhaseLabel}</p>
          )}
          {lead.last_manual_sms_at && (
            <p className="text-xs font-semibold text-red-600 mt-1">SMS sent</p>
          )}
          <p className="text-sm text-gray-500 mt-0.5">{lead.service_type || 'No service type'}</p>
          {showExtractionBadge && (
            <span
              className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full border ${extractionBadgeClass()}`}
            >
              {extractionBadgeLabel()}
            </span>
          )}
          {locality && (
            <p className="text-sm text-gray-500 mt-0.5">📍 {locality}</p>
          )}
        </div>

        {profile?.org_id && (
          <LeadContactEditor
            lead={lead}
            orgId={profile.org_id}
            actorId={profile.id}
            smsEnabled={smsEnabled}
            onCall={() => onCall(lead)}
            onSms={() => setComposeOpen(true)}
            onSaved={onRefresh}
          />
        )}

        {lead.last_manual_sms_text && (
          <div className="rounded-lg bg-red-50 border border-red-100 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600 mb-1">SMS sent</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.last_manual_sms_text}</p>
          </div>
        )}

        {profile?.org_id && (
          <LeadAddressEditor
            leadId={lead.id}
            address={lead.address}
            orgId={profile.org_id}
            actorId={profile.id}
            onSaved={onRefresh}
            variant="sheet"
          />
        )}

        {lead.status === 'contact_attempted' && profile?.org_id && (
          <LeadContactNote
            leadId={lead.id}
            orgId={profile.org_id}
            actorId={profile.id}
            onSaved={onRefresh}
          />
        )}

        {summary && (
          <div>
            <p
              className={`text-sm text-gray-500 leading-relaxed ${
                !summaryExpanded && summaryLong ? 'line-clamp-3' : ''
              }`}
            >
              {summary}
            </p>
            {summaryLong && (
              <button
                type="button"
                onClick={() => setSummaryExpanded((v) => !v)}
                className="text-xs text-[var(--color-primary)] mt-1 font-medium"
              >
                {summaryExpanded ? 'See less' : 'See more'}
              </button>
            )}
          </div>
        )}

        {isCompleted ? (
          <div className="space-y-3">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
              <span className="text-purple-700 font-medium text-sm">Job completed successfully</span>
            </div>
            <button
              type="button"
              onClick={() => onSharePhoto(lead)}
              className="w-full flex items-center gap-3 min-h-[44px] px-1 text-left hover:bg-gray-50"
            >
              <FileText size={20} className="text-[var(--color-primary)]" />
              <span className="text-sm text-gray-800">Share photo</span>
            </button>
            <LeadPhotos leadId={lead.id} canUpload={true} />
          </div>
        ) : (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">Actions</p>
            <div className="rounded-lg border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {!isUnassigned && isManagerRole(profile?.role) && lead.assigned_to && (
                <ActionRow
                  icon={UserPlus}
                  label="Unassign lead"
                  onClick={() => onUnassign(lead)}
                />
              )}
              {(isUnassigned || isManagerRole(profile?.role)) && !hideAssignPool && (
                <ActionRow
                  icon={UserPlus}
                  label="Assign to technician"
                  onClick={() => onAssign(lead)}
                />
              )}
              <ActionRow
                icon={Calendar}
                label="Book appointment"
                onClick={() => onBook(lead)}
              />
              {customerProfilesEnabled && lead.customer_id && (
                <ActionRow
                  icon={History}
                  label="Previous jobs"
                  onClick={() => setHistoryOpen(true)}
                />
              )}
              {quoteEnabled && isManagerRole(profile?.role) && (
                <ActionRow
                  icon={FileText}
                  label="Send quote + e-sign"
                  onClick={() => onQuote(lead)}
                />
              )}
              {smsEnabled && (
                <ActionRow
                  icon={Navigation}
                  label="Send ETA SMS"
                  onClick={() => onSms(lead)}
                />
              )}
              {(lead.raw_email || lead.raw_sms) && (
                <div>
                  <button
                    type="button"
                    onClick={() => setTranscriptOpen((v) => !v)}
                    className="w-full flex items-center gap-3 min-h-[44px] px-1 text-left hover:bg-gray-50"
                  >
                    <FileText size={20} className="shrink-0 text-[var(--color-primary)]" />
                    <span className="flex-1 text-sm text-gray-800">View original transcript</span>
                    <ChevronRight
                      size={16}
                      className={`text-gray-300 shrink-0 transition-transform ${transcriptOpen ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {transcriptOpen && (
                    <div className="px-1 pb-2">
                      <LeadRawSource lead={lead} />
                    </div>
                  )}
                </div>
              )}
              {isManagerRole(profile?.role) && (
                <ActionRow
                  icon={Trash2}
                  label="Remove lead"
                  onClick={() => setDeleteOpen(true)}
                />
              )}
              {canRetryExtraction && (
                <div className="px-1 py-2">
                  <button
                    type="button"
                    disabled={retrying}
                    onClick={() => void handleRetryExtraction()}
                    className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={retrying ? 'animate-spin' : ''} />
                    {retrying ? 'Retrying…' : 'Retry extraction'}
                  </button>
                  {retryError && (
                    <p className="text-xs text-red-600 mt-1 px-1">{retryError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>

    {composeOpen && (
      <SmsComposeModal
        customerName={lead.name}
        onCancel={() => setComposeOpen(false)}
        onSend={(text) => {
          setComposeOpen(false)
          onSendManualSms(lead, text)
        }}
      />
    )}

    {customerProfilesEnabled && lead.customer_id && (
      <CustomerHistorySheet
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        customerId={lead.customer_id}
        currentLeadId={lead.id}
      />
    )}

    {deleteOpen && (
      <DeleteLeadModal
        leadId={lead.id}
        leadName={lead.name || 'Unknown'}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false)
          onClose()
          onDeleted?.()
        }}
      />
    )}
    </>
  )
}
