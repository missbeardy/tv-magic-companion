// src/components/LeadStatusMenu.tsx
import { useState, useRef, useEffect } from 'react'
import { runLeadUpdate } from '../lib/offlineWrites'
import { showToast } from '../lib/toast'
import { sendNotification } from '../lib/notify'
import { useAuth } from '../context/AuthContext'
import { logLeadEvent } from '../lib/leadEvents'
import type { LeadEventType } from '../lib/leadEventPayload'
import {
  ASSIGNMENT_REQUIRED_MESSAGE,
  blocksUnassignedStatusChange,
  buildPoolPickupUpdate,
  shouldPoolPickup,
} from '../lib/leadPoolPickup'
import { buildContactAttemptUpdate } from '../lib/contactFollowUp'

interface Props {
  leadId: string
  currentStatus: string
  assignedTo: string | null
  leadName: string
  leadPhone: string | null | undefined
  reviewRequestSentAt?: string | null
  serviceType: string
  onUpdated: () => void
  logEvent?: (leadId: string, note: string) => Promise<void>
  onCompleteRequested?: () => void
  variant?: 'badge' | 'pill'
  contactAttemptRound?: number | null
}

const STATUSES = [
  { value: 'unassigned',        label: 'Unassigned',        color: 'bg-gray-100 text-gray-600' },
  { value: 'assigned',          label: 'Assigned',          color: 'bg-violet-100 text-violet-700' },
  { value: 'contact_attempted', label: 'Contact Attempted', color: 'bg-amber-100 text-amber-700' },
  { value: 'booked',            label: 'Booked',            color: 'bg-indigo-100 text-indigo-700' },
  { value: 'booking_cancelled', label: 'Booking Cancelled', color: 'bg-red-100 text-red-700' },
  { value: 'lost',              label: 'Lost',              color: 'bg-red-100 text-red-600' },
  { value: 'completed',         label: 'Completed',         color: 'bg-purple-100 text-purple-700' },
]

const REPORTABLE_STATUS_EVENTS = new Set([
  'contact_attempted',
  'booked',
  'lost',
  'completed',
  'expired',
  'booking_cancelled',
  'unassigned',
])

function resolveStatusEventType(newStatus: string): LeadEventType {
  if (REPORTABLE_STATUS_EVENTS.has(newStatus)) {
    return newStatus as LeadEventType
  }
  return 'status_change'
}

export default function LeadStatusMenu({
  leadId,
  currentStatus,
  assignedTo,
  leadName,
  serviceType,
  onUpdated,
  onCompleteRequested,
  variant = 'badge',
  contactAttemptRound = 0,
}: Props) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const current = STATUSES.find(s => s.value === currentStatus) ?? STATUSES[0]

  const buttonClass =
    variant === 'pill'
      ? 'text-xs border border-gray-300 bg-white hover:bg-gray-50 min-h-[44px] py-1 px-3 rounded-full text-gray-700 font-normal inline-flex items-center gap-1'
      : `text-xs min-h-[44px] px-3 py-1 rounded-full font-medium capitalize inline-flex items-center gap-1 ${current.color}`

  useEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    setDropUp(spaceBelow < 220)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.closest('.status-menu-root')?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function applyStatusUpdate(fromStatus: string, newStatus: string): Promise<boolean> {
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
      const attempt = buildContactAttemptUpdate({
        id: leadId,
        status: fromStatus,
        contact_attempt_round: contactAttemptRound,
      })
      if (attempt.kind === 'unable_to_contact') {
        const confirmed = window.confirm(
          `${leadName} has had 5 contact attempts.\n\nMark as lost (unable to contact)?`
        )
        if (!confirmed) return false
      }
      Object.assign(updatePayload, attempt.update)
    }

    Object.assign(
      updatePayload,
      buildPoolPickupUpdate(fromStatus, newStatus, profile?.id)
    )

    const effectiveAssignedTo = 'assigned_to' in updatePayload
      ? (updatePayload.assigned_to as string | null)
      : assignedTo
    if (blocksUnassignedStatusChange(newStatus, effectiveAssignedTo)) {
      window.alert(ASSIGNMENT_REQUIRED_MESSAGE)
      return false
    }

    const writeResult = await runLeadUpdate(leadId, updatePayload)
    if (!writeResult.ok) {
      showToast({
        variant: 'error',
        message: writeResult.network
          ? "Couldn't reach the server — status not saved. Check your signal and retry."
          : "Couldn't update the status. Tap retry.",
        action: { label: 'Retry', onClick: () => { void updateStatus(newStatus) } },
      })
      return false
    }

    if (shouldPoolPickup(fromStatus, newStatus, profile?.id)) {
      await logLeadEvent({
        leadId,
        orgId: profile?.org_id ?? null,
        eventType: 'assigned',
        note: 'Lead picked up from pool via status menu',
        actorId: profile?.id ?? null,
        payload: { assigned_to: profile!.id, source: 'status_menu' },
      })
    }

    const effectiveStatus = String(updatePayload.status ?? newStatus)

    if (fromStatus !== effectiveStatus) {
      await logLeadEvent({
        leadId,
        orgId: profile?.org_id ?? null,
        eventType: effectiveStatus === 'lost' ? 'lost' : resolveStatusEventType(effectiveStatus),
        note:
          effectiveStatus === 'lost' && updatePayload.lost_reason
            ? 'Marked lost — unable to contact'
            : `Status changed from ${fromStatus} to ${effectiveStatus} via menu`,
        actorId: profile?.id ?? null,
        payload: {
          from_status: fromStatus,
          to_status: effectiveStatus,
          source: 'status_menu',
          ...(updatePayload.lost_reason ? { reason: updatePayload.lost_reason } : {}),
        },
      })
    }

    const notifyAssignee =
      (updatePayload.assigned_to as string | undefined) ?? assignedTo

    if ((effectiveStatus === 'completed' || effectiveStatus === 'lost') && notifyAssignee) {
      const statusLabel = effectiveStatus === 'completed' ? 'Completed' : 'Lost'
      await sendNotification(
        notifyAssignee,
        `Job ${statusLabel}`,
        `${leadName} — ${serviceType}`,
        `/leads?leadId=${leadId}`,
        'lead_status'
      )
    }

    return true
  }

  async function updateStatus(newStatus: string) {
    setOpen(false)

    if (newStatus === 'completed') {
      if (onCompleteRequested) {
        onCompleteRequested()
        return
      }
      // Completions must go through CompletionChecklist — never update status alone.
      console.warn('LeadStatusMenu: completed requires onCompleteRequested')
      return
    }

    // Guard destructive transitions against a mis-tap in the dropdown.
    if ((newStatus === 'lost' || newStatus === 'booking_cancelled') && newStatus !== currentStatus) {
      const label = newStatus === 'lost' ? 'Lost' : 'Booking Cancelled'
      if (!window.confirm(`Mark "${leadName}" as ${label}?`)) return
    }

    setSaving(true)
    const ok = await applyStatusUpdate(currentStatus, newStatus)
    setSaving(false)
    if (ok) onUpdated()
  }

  return (
    <div className="status-menu-root relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        disabled={saving}
        className={buttonClass}
      >
        {saving ? 'Saving...' : current.label}
        <span className={variant === 'pill' ? 'text-gray-400' : 'opacity-60'}>▾</span>
      </button>

      {open && (
        <div
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 min-w-36 overflow-hidden"
          style={{
            top: buttonRef.current
              ? dropUp
                ? buttonRef.current.getBoundingClientRect().top - (STATUSES.length * 44)
                : buttonRef.current.getBoundingClientRect().bottom + 4
              : 0,
            left: buttonRef.current
              ? buttonRef.current.getBoundingClientRect().left
              : 0,
          }}
        >
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => updateStatus(s.value)}
              className={`w-full text-left px-3 min-h-[44px] flex items-center text-sm hover:bg-gray-50 transition capitalize ${s.value === currentStatus ? 'font-semibold bg-gray-50' : ''}`}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${s.color.split(' ')[0]}`} />
              {s.label}
              {s.value === 'unassigned' && assignedTo && (
                <span className="ml-1 text-[10px] text-gray-400">(unassigns)</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
