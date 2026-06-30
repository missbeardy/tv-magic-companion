import { useState } from 'react'
import {
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  UserPlus,
  Calendar,
  MailCheck,
  FileText,
  ChevronRight,
} from 'lucide-react'
import BottomSheet from './BottomSheet'
import LeadPhotos from './LeadPhotos'
import LeadAddressEditor from './LeadAddressEditor'
import { LeadRawSource } from './LeadExtractedSummary'
import { formatLocalityLabelFromAddress } from '../lib/extractSuburb'
import { getAttemptPhaseLabel, LOST_REASON_UNABLE_TO_CONTACT } from '../lib/contactFollowUp'
import { getLeadDisplayDetails } from '../lib/leadDisplay'
import { isManagerRole } from '../lib/roles'
import type { KanbanLead } from './LeadCard'

interface Props {
  lead: KanbanLead
  isOpen: boolean
  onClose: () => void
  profile: { role: string; id: string; org_id?: string } | null
  onCall: (lead: KanbanLead) => void
  onSms: (lead: KanbanLead) => void
  onAssign: (lead: KanbanLead) => void
  onBook: (lead: KanbanLead) => void
  onQuote: (lead: KanbanLead) => void
  onMarkContactAttempted: (lead: KanbanLead) => void
  onUnassign: (lead: KanbanLead) => void
  onComplete: (lead: KanbanLead) => void
  onSharePhoto: (lead: KanbanLead) => void
  quoteEnabled: boolean
  smsEnabled: boolean
  hideAssignPool?: boolean
  onRefresh: () => void
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
  onAssign,
  onBook,
  onQuote,
  onMarkContactAttempted,
  onUnassign,
  onComplete,
  onSharePhoto,
  quoteEnabled,
  smsEnabled,
  hideAssignPool = false,
  onRefresh,
}: Props) {
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

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

  return (
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
          {attemptPhaseLabel && lead.status === 'assigned' && (
            <p className="text-xs font-semibold text-red-600 mt-1">{attemptPhaseLabel}</p>
          )}
          <p className="text-sm text-gray-500 mt-0.5">{lead.service_type || 'No service type'}</p>
          {locality && (
            <p className="text-sm text-gray-500 mt-0.5">📍 {locality}</p>
          )}
        </div>

        {(lead.phone || lead.email) && (
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-2">
            {lead.phone && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800 flex-1">{lead.phone}</span>
                <button
                  type="button"
                  onClick={() => onCall(lead)}
                  className="p-2 rounded-lg text-[var(--color-primary)] hover:bg-white transition-colors"
                  aria-label="Call"
                >
                  <Phone size={18} />
                </button>
                {smsEnabled && (
                  <button
                    type="button"
                    onClick={() => onSms(lead)}
                    className="p-2 rounded-lg text-[var(--color-primary)] hover:bg-white transition-colors"
                    aria-label="Send SMS"
                  >
                    <MessageSquare size={18} />
                  </button>
                )}
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-gray-400 shrink-0" />
                <a
                  href={`mailto:${lead.email}`}
                  className="text-sm text-gray-800 truncate hover:text-[var(--color-primary)]"
                >
                  {lead.email}
                </a>
              </div>
            )}
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
              {quoteEnabled && isManagerRole(profile?.role) && (
                <ActionRow
                  icon={FileText}
                  label="Send quote + e-sign"
                  onClick={() => onQuote(lead)}
                />
              )}
              <ActionRow
                icon={MailCheck}
                label="Mark as attempted contact"
                onClick={() => onMarkContactAttempted(lead)}
              />
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
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
