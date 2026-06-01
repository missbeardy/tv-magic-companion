import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  leadId: string
  currentStatus: string
  onUpdated: () => void
}

const STATUSES = [
  { value: 'unassigned', label: 'Unassigned', color: 'bg-gray-100 text-gray-600' },
  { value: 'assigned', label: 'Assigned', color: 'bg-blue-100 text-blue-700' },
  { value: 'won', label: 'Won', color: 'bg-green-100 text-green-700' },
  { value: 'lost', label: 'Lost', color: 'bg-red-100 text-red-600' },
  { value: 'completed', label: 'Completed', color: 'bg-purple-100 text-purple-700' },
]

export default function LeadStatusMenu({ leadId, currentStatus, onUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const current = STATUSES.find(s => s.value === currentStatus) || STATUSES[0]

  async function updateStatus(newStatus: string) {
    setSaving(true)
    setOpen(false)
    await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', leadId)
    setSaving(false)
    onUpdated()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={saving}
        className={`text-xs px-2 py-1 rounded-full font-medium capitalize flex items-center gap-1 ${current.color}`}
      >
        {saving ? 'Saving...' : current.label}
        <span className="opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-7 bg-white rounded-xl shadow-xl border border-gray-200 z-50 min-w-36 overflow-hidden">
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