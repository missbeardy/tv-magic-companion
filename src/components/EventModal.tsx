// src/components/EventModal.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import TimePicker from './TimePicker'
import { X, CalendarDays, Clock, User, FileText, MapPin } from 'lucide-react'

interface Lead {
  id: string
  name: string
  service_type: string
  address?: string
  phone?: string
}

interface Props {
  prefillLead?: Lead | null
  onClose: () => void
  onSaved: () => void
  existingEvent?: {
    id: string
    title: string
    start_time: string
    end_time: string
    notes?: string
    lead_id?: string
  }
}

export default function EventModal({ prefillLead, onClose, onSaved, existingEvent }: Props) {
  const { profile } = useAuth()
  const [title, setTitle] = useState(existingEvent?.title ?? (prefillLead ? `${prefillLead.service_type} — ${prefillLead.name}` : ''))
  const [date, setDate] = useState(existingEvent ? existingEvent.start_time.split('T')[0] : new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState(existingEvent ? existingEvent.start_time.slice(11, 16) : '09:00')
  const [endTime, setEndTime] = useState(existingEvent ? existingEvent.end_time.slice(11, 16) : '10:00')
  const [notes, setNotes] = useState(existingEvent?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (prefillLead && !existingEvent) {
      setTitle(`${prefillLead.service_type} — ${prefillLead.name}`)
    }
  }, [prefillLead])

  async function handleSave() {
    if (!title.trim()) { setError('Please add a title'); return }
    setSaving(true)
    setError('')

    const startISO = `${date}T${startTime}:00`
    const endISO   = `${date}T${endTime}:00`

    if (existingEvent) {
      const { error: e } = await supabase
        .from('events')
        .update({ title, start_time: startISO, end_time: endISO, notes })
        .eq('id', existingEvent.id)
      if (e) { setError(e.message); setSaving(false); return }
    } else {
      const { error: e } = await supabase
        .from('events')
        .insert({
          title,
          start_time: startISO,
          end_time: endISO,
          notes,
          lead_id: prefillLead?.id ?? null,
          user_id: profile?.id,
          org_id: profile?.org_id,
        })
      if (e) { setError(e.message); setSaving(false); return }
    }

    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#004B93]/10 flex items-center justify-center">
              <CalendarDays size={15} className="text-[#004B93]" />
            </div>
            <h3 className="font-display font-semibold text-gray-900 text-base">
              {existingEvent ? 'Edit Appointment' : 'Book Appointment'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Prefill info */}
          {prefillLead && (
            <div className="bg-[#004B93]/5 border border-[#004B93]/15 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <User size={12} className="text-[#004B93]" />
                <p className="text-xs font-semibold text-[#004B93]">{prefillLead.name}</p>
              </div>
              {prefillLead.address && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={11} className="text-[#00B4C5]" />
                  <p className="text-xs text-gray-500">{prefillLead.address}</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <FileText size={11} className="inline mr-1" />Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Appointment title"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <CalendarDays size={11} className="inline mr-1" />Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#004B93] transition-colors"
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                <Clock size={11} className="inline mr-1" />Start
              </label>
              <TimePicker value={startTime} onChange={setStartTime} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                <Clock size={11} className="inline mr-1" />End
              </label>
              <TimePicker value={endTime} onChange={setEndTime} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Notes <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Any details for this appointment…"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#004B93] text-white text-sm font-semibold hover:bg-[#003d7a] transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : existingEvent ? 'Save Changes' : 'Book Appointment'}
          </button>
        </div>
      </div>
    </div>
  )
}