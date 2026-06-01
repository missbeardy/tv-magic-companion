import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import TimePicker from './TimePicker'

interface Lead {
  id: string
  name: string
  phone: string
  email: string
  details: string
  service_type: string
}

interface Event {
  id?: string
  title: string
  description: string
  start_time: string
  end_time: string
  user_id?: string
  color: string
  category?: string
  client_name?: string
  client_phone?: string
  client_email?: string
  client_address?: string
  client_job?: string
  lead_id?: string
}

interface Profile {
  id: string
  full_name: string
}

interface Props {
  event?: Event | null
  defaultDate?: string
  prefillLead?: Lead | null
  onClose: () => void
  onSaved: () => void
}

const CATEGORIES = [
  'General',
  'Client Appointment',
  'Internal Meeting',
  'Site Visit',
  'Follow Up',
]

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function getCurrentTime(): string {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const rawMinutes = now.getMinutes()
  const roundedMinutes = String(Math.ceil(rawMinutes / 5) * 5 === 60 ? 0 : Math.ceil(rawMinutes / 5) * 5).padStart(2, '0')
  return `${hours}:${roundedMinutes}`
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const newH = (h + 1) % 24
  return `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function EventModal({ event, defaultDate, prefillLead, onClose, onSaved }: Props) {
  const { profile } = useAuth()

  const initDate = defaultDate
    ? defaultDate.slice(0, 10)
    : event?.start_time
    ? new Date(event.start_time).toISOString().slice(0, 10)
    : getTodayDate()

  const initStartTime = event?.start_time
    ? new Date(event.start_time).toTimeString().slice(0, 5)
    : getCurrentTime()

  const initEndTime = event?.end_time
    ? new Date(event.end_time).toTimeString().slice(0, 5)
    : addHour(initStartTime)

  const [title, setTitle] = useState(event?.title || '')
  const [description, setDescription] = useState(event?.description || '')
  const [date, setDate] = useState(initDate)
  const [startTime, setStartTime] = useState(initStartTime)
  const [endTime, setEndTime] = useState(initEndTime)
  const [color, setColor] = useState(event?.color || '#004B93')
  const [category, setCategory] = useState(event?.category || 'General')
  const [clientName, setClientName] = useState(event?.client_name || prefillLead?.name || '')
  const [clientPhone, setClientPhone] = useState(event?.client_phone || prefillLead?.phone || '')
  const [clientEmail, setClientEmail] = useState(event?.client_email || prefillLead?.email || '')
  const [clientAddress, setClientAddress] = useState(event?.client_address || '')
  const [clientJob, setClientJob] = useState(event?.client_job || prefillLead?.details || '')
  const [selectedUserId, setSelectedUserId] = useState(event?.user_id || profile?.id || '')
  const [employees, setEmployees] = useState<Profile[]>([])
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile?.role === 'manager') {
      supabase
        .from('profiles')
        .select('id, full_name')
        .then(({ data }) => { if (data) setEmployees(data) })
    }
  }, [profile])

  // Auto-set title from category + client name
  useEffect(() => {
    if (category === 'Client Appointment' && clientName && !event?.id) {
      setTitle(`Appointment — ${clientName}`)
    }
  }, [category, clientName])

  async function handleSave() {
    if (!title || !date || !startTime || !endTime) {
      setError('Please fill in all required fields.')
      return
    }
    setSaving(true)
    setError('')

    const payload: Record<string, unknown> = {
      title,
      description,
      start_time: new Date(`${date}T${startTime}`).toISOString(),
      end_time: new Date(`${date}T${endTime}`).toISOString(),
      color,
      category,
      user_id: selectedUserId,
      lead_id: prefillLead?.id || event?.lead_id || null,
    }

    if (category === 'Client Appointment') {
      payload.client_name = clientName
      payload.client_phone = clientPhone
      payload.client_email = clientEmail
      payload.client_address = clientAddress
      payload.client_job = clientJob
    }

    let dbError

    if (event?.id) {
      setSyncing(true)
      await new Promise(r => setTimeout(r, 1200))
      const result = await supabase.from('events').update(payload).eq('id', event.id)
      dbError = result.error
      setSyncing(false)
    } else {
      const result = await supabase.from('events').insert(payload)
      dbError = result.error
    }

    if (dbError) {
      setError('Failed to save: ' + dbError.message)
    } else {
      onSaved()
      onClose()
    }

    setSaving(false)
  }

  async function handleDelete() {
    if (!event?.id) return
    await supabase.from('events').delete().eq('id', event.id)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-screen overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {event?.id ? 'Edit Event' : 'New Event'}
          </h3>

          {syncing && (
            <div className="bg-blue-50 text-blue-600 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Syncing changes back to CRM...
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {prefillLead && (
            <div className="bg-teal-50 border border-teal-200 text-teal-700 text-sm p-3 rounded-lg mb-4">
              📋 Pre-filled from lead: <strong>{prefillLead.name}</strong>
            </div>
          )}

          <div className="space-y-4">

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Client Appointment Fields */}
            {category === 'Client Appointment' && (
              <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client Details</p>
                {[
                  { label: 'Name', value: clientName, set: setClientName, placeholder: 'Client full name' },
                  { label: 'Phone', value: clientPhone, set: setClientPhone, placeholder: 'Client phone number' },
                  { label: 'Email', value: clientEmail, set: setClientEmail, placeholder: 'Client email' },
                  { label: 'Address', value: clientAddress, set: setClientAddress, placeholder: 'Job address' },
                ].map(({ label, value, set, placeholder }) => (
                  <div key={label}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input
                      type="text"
                      value={value}
                      onChange={e => set(e.target.value)}
                      placeholder={placeholder}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Job Description</label>
                  <textarea
                    value={clientJob}
                    onChange={e => setClientJob(e.target.value)}
                    placeholder="What work is needed?"
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="Event title"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="Optional notes"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              />
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                <TimePicker value={startTime} onChange={setStartTime} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
                <TimePicker value={endTime} onChange={setEndTime} />
              </div>
            </div>

            {/* Assign To (manager only) */}
            {profile?.role === 'manager' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Colour */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colour</label>
              <div className="flex gap-2">
                {['#004B93', '#00B4C5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition ${color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            {event?.id && (
              <button
                onClick={handleDelete}
                className="border border-red-300 text-red-500 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition"
              >
                Delete
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-[#004B93] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#003d7a] transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : event?.id ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}