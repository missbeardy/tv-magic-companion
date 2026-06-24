// src/components/LeadStatusMenu.tsx
import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { sendPushNotification } from '../lib/sendPush'
import { useAuth } from '../context/AuthContext'
import ReviewRequestModal from './ReviewRequestModal'
import {
  isReviewRequestEligible,
  sendReviewRequestSms,
  type ReviewRequestLead,
} from '../lib/reviewRequest'

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
}

const STATUSES = [
  { value: 'unassigned',        label: 'Unassigned',        color: 'bg-gray-100 text-gray-600' },
  { value: 'assigned',          label: 'Assigned',          color: 'bg-blue-100 text-blue-700' },
  { value: 'contact_attempted', label: 'Contact Attempted', color: 'bg-amber-100 text-amber-700' },
  { value: 'booked',            label: 'Booked',            color: 'bg-green-100 text-green-700' },
  { value: 'booking_cancelled', label: 'Booking Cancelled', color: 'bg-red-100 text-red-700' },
  { value: 'lost',              label: 'Lost',              color: 'bg-red-100 text-red-600' },
  { value: 'completed',         label: 'Completed',         color: 'bg-purple-100 text-purple-700' },
]

export default function LeadStatusMenu({
  leadId,
  currentStatus,
  assignedTo,
  leadName,
  leadPhone,
  reviewRequestSentAt,
  serviceType,
  onUpdated,
  logEvent,
}: Props) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewSending, setReviewSending] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const lead: ReviewRequestLead = {
    id: leadId,
    name: leadName,
    phone: leadPhone,
    review_request_sent_at: reviewRequestSentAt,
  }

  const current = STATUSES.find(s => s.value === currentStatus) ?? STATUSES[0]

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

  async function applyStatusUpdate(newStatus: string) {
    const updatePayload: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'unassigned') {
      updatePayload.assigned_to = null
      updatePayload.assigned_at = null
      updatePayload.timer_expires_at = null
    }

    await supabase.from('leads').update(updatePayload).eq('id', leadId)

    if ((newStatus === 'completed' || newStatus === 'lost') && assignedTo) {
      const statusLabel = newStatus === 'completed' ? 'Completed' : 'Lost'
      await sendPushNotification(
        assignedTo,
        `Job ${statusLabel}`,
        `${leadName} — ${serviceType}`,
        `/leads?leadId=${leadId}`
      )
    }
  }

  async function updateStatus(newStatus: string) {
    setOpen(false)

    if (newStatus === 'completed') {
      const eligible = await isReviewRequestEligible(null, lead, profile?.org_id)
      if (eligible && leadPhone?.trim()) {
        setShowReviewModal(true)
        return
      }
    }

    setSaving(true)
    await applyStatusUpdate(newStatus)
    setSaving(false)
    onUpdated()
  }

  async function finalizeCompleted(sendReview: boolean) {
    setSaving(true)
    await applyStatusUpdate('completed')
    if (sendReview) {
      setReviewSending(true)
      setReviewError(null)
      const result = await sendReviewRequestSms(lead, logEvent)
      setReviewSending(false)
      if (!result.ok) {
        setReviewError(result.error)
        setSaving(false)
        onUpdated()
        return
      }
    }
    setShowReviewModal(false)
    setSaving(false)
    onUpdated()
  }

  return (
    <div className="status-menu-root relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        disabled={saving}
        className={`text-xs px-2 py-1 rounded-full font-medium capitalize flex items-center gap-1 ${current.color}`}
      >
        {saving ? 'Saving...' : current.label}
        <span className="opacity-60">▾</span>
      </button>

      {open && (
        <div
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 min-w-36 overflow-hidden"
          style={{
            top: buttonRef.current
              ? dropUp
                ? buttonRef.current.getBoundingClientRect().top - (STATUSES.length * 40)
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
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition capitalize ${s.value === currentStatus ? 'font-semibold bg-gray-50' : ''}`}
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

      {showReviewModal && leadPhone?.trim() && (
        <ReviewRequestModal
          customerName={leadName}
          customerPhone={leadPhone.trim()}
          sending={reviewSending}
          error={reviewError}
          onSend={() => finalizeCompleted(true)}
          onSkip={() => finalizeCompleted(false)}
        />
      )}
    </div>
  )
}
