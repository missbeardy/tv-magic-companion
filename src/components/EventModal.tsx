import { useState, useEffect, useRef } from 'react'
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

// Updated Categories to match your instruction exactly
const CATEGORIES = ['General', 'Booking', 'Internal']

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
  const autocompleteInputRef = useRef<HTMLInputElement>(null)

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

  // Dynamically load Google Maps script for Address Autocomplete
  useEffect(() => {
    // CHANGE THIS TO YOUR RELEVANT KEY OR ACCESS PROCESS ENV VARIABLES DIRECTLY
    const API_KEY = "AIzaSyCUENcWzrgodMQlWDOu8y96K0QGzukyMnk"; 

    if (category !== 'Booking') return

    const initAutocomplete = () => {
      if (!autocompleteInputRef.current || !(window as any).google) return
      const autocomplete = new (window as any).google.maps.places.Autocomplete(autocompleteInputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'au' } // Locks lookup bounds down to local dynamic contexts
      })
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        if (place.formatted_address) {
          setClientAddress(place.formatted_address)
        }
      })
    }

    if (!(window as any).google) {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`
      script.async = true
      script.defer = true
      script.onload = () => initAutocomplete()
      document.head.appendChild(script)
    } else {
      initAutocomplete()
    }
  }, [category])

  useEffect(() => {
    if (profile?.role === 'manager') {
      supabase
        .from('profiles')
        .select('id, full_name')
        .then(({ data }) => { if (data) setEmployees(data) })
    }
  }, [profile])

  // Auto-set structural text labels dynamically based on explicit Category modifications
  useEffect(() => {
    if (category === 'Booking' && clientName && !event?.id) {
      setTitle(`Booking — ${clientName}`)
    }
  }, [category, clientName])

  async function handleSave() {
    if (!title || !date || !startTime || !endTime) {
      setError('Please fill in all required fields.')
      return
    }
    setSaving(true)
    setError('')

    const targetLeadId = prefillLead?.id || event?.lead_id || null

    const payload: Record<string, unknown> = {
      title,
      description,
      start_time: new Date(`${date}T${startTime}`).toISOString(),
      end_time: new Date(`${date}T${endTime}`).toISOString(),
      color,
      category,
      user_id: selectedUserId,
      lead_id: targetLeadId,
    }

    if (category === 'Booking') {
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

      // CRITICAL RULE IMPLEMENTATION: Transition corresponding database target parameters into Booked status natively inside creation steps
      if (!dbError && category === 'Booking' && targetLeadId) {
        await supabase
          .from('leads')
          .update({ status: 'booked' })
          .eq('id', targetLeadId)
      }
    }

    if (dbError) {
      setError('Failed to save event parameters: ' + dbError.message)
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
            {event?.id ? 'Edit Event Setup' : 'New Event Entry'}
          </h3>

          {syncing && (
            <div className="bg-blue-50 text-blue-600 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Syncing updates back to production CRM framework...
            </div>
          )}

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}

          {prefillLead && (
            <div className="bg-teal-50 border border-teal-200 text-teal-700 text-sm p-3 rounded-lg mb-4">
              📋 Pre-filled directly from active target lead data: <strong>{prefillLead.name}</strong>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category Classification</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Render targeted subform options if Category evaluates exactly to structural Booking criteria */}
            {category === 'Booking' && (
              <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client File Information</p>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Client name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone Connection</label>
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={e => setClientPhone(e.target.value)}
                    placeholder="Phone"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email Coordinates</label>
                  <input
                    type="text"
                    value={clientEmail}
                    onChange={e => setClientEmail(e.target.value)}
                    placeholder="Email Address"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Job Site Address (Google Maps Connected)</label>
                  <input
                    ref={autocompleteInputRef}
                    type="text"
                    value={clientAddress}
                    onChange={e => setClientAddress(e.target.value)}
                    placeholder="Start typing job address..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Job Specifics</label>
                  <textarea
                    value={clientJob}
                    onChange={e => setClientJob(e.target.value)}
                    placeholder="Scope details..."
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title Entry *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="Title identifier"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplemental Workspace Notes</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="Optional workflow remarks"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Appointment Date *</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start *</label>
                <TimePicker value={startTime} onChange={setStartTime} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End *</label>
                <TimePicker value={endTime} onChange={setEndTime} />
              </div>
            </div>

            {profile?.role === 'manager' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Assignment Matrix</label>
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                >
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Colour Configuration</label>
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
              <button onClick={handleDelete} className="border border-red-300 text-red-500 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition">
                Remove Event
              </button>
            )}
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-[#004B93] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#003d7a] transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : event?.id ? 'Update Setup' : 'Confirm Setup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}