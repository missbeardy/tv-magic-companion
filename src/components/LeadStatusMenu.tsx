import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { sendPushNotification } from '../lib/sendPush'

interface Props {
  leadId: string
  currentStatus: string
  assignedTo: string | null
  leadName: string
  serviceType: string
  onUpdated: () => void
}

const STATUSES = [
  { value: 'unassigned',        label: 'Unassigned',        color: 'bg-gray-100 text-gray-600' },
  { value: 'assigned',          label: 'Assigned',          color: 'bg-blue-100 text-blue-700' },
  { value: 'contact_attempted', label: 'Contact Attempted', color: 'bg-amber-100 text-amber-700' },
  { value: 'booked',            label: 'Booked',            color: 'bg-green-100 text-green-700' },
  { value: 'lost',              label: 'Lost',              color: 'bg-red-100 text-red-600' },
  { value: 'completed',         label: 'Completed',         color: 'bg-purple-100 text-purple-700' },
]

export default function LeadStatusMenu({ leadId, currentStatus, assignedTo, leadName, serviceType, onUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const current = STATUSES.find(s => s.value === currentStatus) || STATUSES[0]

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

  async function updateStatus(newStatus: string) {
    setSaving(true)
    setOpen(false)

    await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', leadId)

    if ((newStatus === 'completed' || newStatus === 'lost') && assignedTo) {
      const statusLabel = newStatus === 'completed' ? 'Completed' : 'Lost'
      await sendPushNotification(
        assignedTo,
        `Job ${statusLabel}`,
        `${leadName} — ${serviceType}`,
        `/leads?leadId=${leadId}`
      )
    }

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
          className={`fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 min-w-36 overflow-hidden`}
          style={{
            top: buttonRef.current
              ? dropUp
                ? buttonRef.current.getBoundingClientRect().top - 180
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
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition capitalize ${s.value === currentStatus ? 'font-semibold' : ''}`}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${s.color.split(' ')[0]}`} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}