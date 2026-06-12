// src/components/EventModal.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import TimePicker from './TimePicker'
import { X, CalendarDays, Clock, User, FileText, MapPin, Phone, Briefcase } from 'lucide-react'

interface Lead {
  id: string
  name: string
  service_type: string
  address?: string
  phone?: string
  email?: string
  details?: string
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
    client_name?: string
    client_phone?: string
    client_email?: string
    client_address?: string
    client_job?: string
  }
}

export default function EventModal({ prefillLead, onClose, onSaved, existingEvent }: Props) {
  const { profile } = useAuth()
  const [title, setTitle] = useState(existingEvent?.title ?? (prefillLead ? `${prefillLead.service_type} — ${prefillLead.name}` : ''))
  const [date, setDate] = useState(existingEvent ? existingEvent.start_time.split('T')[0] : new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState(existingEvent ? existingEvent.start_time.slice(11, 16) : '09:00')
  const [endTime, setEndTime] = useState(existingEvent ? existingEvent.end_time.slice(11, 16) : '10:00')
  const [notes, setNotes] = useState(existingEvent?.notes ?? '')
  
  // Customer fields
  const [clientName, setClientName] = useState(existingEvent?.client_name ?? prefillLead?.name ?? '')
  const [clientPhone, setClientPhone] = useState(existingEvent?.client_phone ?? prefillLead?.phone ?? '')
  const [clientEmail, setClientEmail] = useState(existingEvent?.client_email ?? prefillLead?.email ?? '')
  const [clientAddress, setClientAddress] = useState(existingEvent?.client_address ?? prefillLead?.address ?? '')
  const [clientJob, setClientJob] = useState(existingEvent?.client_job ?? prefillLead?.details ?? prefillLead?.service_type ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Update fields if prefillLead changes (e.g., when modal opens with a different lead)
  useEffect(() => {
    if (prefillLead && !existingEvent) {
      setTitle(`${prefillLead.service_type} — ${prefillLead.name}`)
      setClientName(prefillLead.name)
      setClientPhone(prefillLead.phone ?? '')
      setClientEmail(prefillLead.email ?? '')
      setClientAddress(prefillLead.address ?? '')
      setClientJob(prefillLead.details ?? prefillLead.service_type)
    }
  }, [prefillLead, existingEvent])

  async function handleSave() {
    if (!title.trim()) { setError('Please add a title'); return }
    setSaving(true)
    setError('')

    const startISO = `${date}T${startTime}:00`
    const endISO   = `${date}T${endTime}:00`

    const eventData = {
      title,
      start_time: startISO,
      end_time: endISO,
      notes,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail,
      client_address: clientAddress,
      client_job: clientJob,
      lead_id: prefillLead?.id ?? existingEvent?.lead_id ?? null,
      user_id: profile?.id,
      org_id: profile?.org_id,
    }

    if (existingEvent) {
      const { error: e } = await supabase
        .from('events')
        .update(eventData)
        .eq('id', existingEvent.id)
      if (e) { setError(e.message); setSaving(false); return }
    } else {
      const { error: e } = await supabase
        .from('events')
        .insert(eventData)
      if (e) { setError(e.message); setSaving(false); return }
    }

    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
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

        {/* Scrollable form content */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Customer Information Section */}
          <div className="bg-[#004B93]/5 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-[#004B93] uppercase tracking-wide">Customer Information</p>
            
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <User size={11} className="inline mr-1" />Full Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Customer name"
                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93] transition-colors"
              />
            </div>

            {/* Phone + Email inline on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <Phone size={11} className="inline mr-1" />Phone
                </label>
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                  placeholder="0412 345 678"
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <MapPin size={11} className="inline mr-1" />Address
              </label>
              <input
                type="text"
                value={clientAddress}
                onChange={e => setClientAddress(e.target.value)}
                placeholder="Street address, suburb"
                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
              />
            </div>

            {/* Job details / Service type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Briefcase size={11} className="inline mr-1" />Job Details
              </label>
              <textarea
                value={clientJob}
                onChange={e => setClientJob(e.target.value)}
                rows={2}
                placeholder="What needs to be done?"
                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93] resize-none"
              />
            </div>
          </div>

          {/* Appointment Section */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Appointment Details</p>
            
            {/* Title */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <FileText size={11} className="inline mr-1" />Title
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Appointment title"
                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
              />
            </div>

            {/* Date */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <CalendarDays size={11} className="inline mr-1" />Date
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
              />
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <Clock size={11} className="inline mr-1" />Start
                </label>
                <TimePicker value={startTime} onChange={setStartTime} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <Clock size={11} className="inline mr-1" />End
                </label>
                <TimePicker value={endTime} onChange={setEndTime} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Notes <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Any internal notes for this appointment…"
                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm placeholder-gray-300 focus:outline-none focus:border-[#004B93] resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer - buttons fixed at bottom */}
        <div className="px-6 pb-5 pt-2 border-t border-gray-100 shrink-0 flex gap-3">
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
