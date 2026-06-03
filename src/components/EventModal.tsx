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
  address?: string
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

// Updated standard categories list to match your layout requirements
const CATEGORIES = ['General', 'Booking', 'Assigned Leads', 'Internal']

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function getCurrentTime(): string {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(Math.ceil(now.getMinutes() / 5) * 5 === 60 ? 0 : Math.ceil(now.getMinutes() / 5) * 5).padStart(2, '0')
  return `${hours}:${minutes}`
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const newH = (h + 1) % 24
  return `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function EventModal({ event, defaultDate, prefillLead, onClose, onSaved }: Props) {
  const { profile } = useAuth()
  const autocompleteInputRef = useRef<HTMLInputElement>(null)
  const autocompleteInstance = useRef<any>(null)

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
  const [category, setCategory] = useState(event?.category || (prefillLead ? 'Booking' : 'General'))
  
  // My Assigned Leads context states
  const [myAssignedLeads, setMyAssignedLeads] = useState<Lead[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string>(event?.lead_id || prefillLead?.id || '')

  // Client Details states
  const [clientName, setClientName] = useState(event?.client_name || prefillLead?.name || '')
  const [clientPhone, setClientPhone] = useState(event?.client_phone || prefillLead?.phone || '')
  const [clientEmail, setClientEmail] = useState(event?.client_email || prefillLead?.email || '')
  const [clientAddress, setClientAddress] = useState(event?.client_address || prefillLead?.address || '')
  const [clientJob, setClientJob] = useState(event?.client_job || prefillLead?.details || '')
  
  const [selectedUserId, setSelectedUserId] = useState(event?.user_id || profile?.id || '')
  const [employees, setEmployees] = useState<Profile[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Fetch the current user's assigned leads to populate the dropdown selection list
  useEffect(() => {
    if (!profile?.id) return
    async function fetchMyLeads() {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('assigned_to', profile.id)
        .eq('status', 'assigned')
      if (data) setMyAssignedLeads(data as Lead[])
    }
    fetchMyLeads()
  }, [profile])

  // Handle auto-populating fields when an Assigned Lead is chosen from the dropdown list
  function handleLeadSelection(leadId: string) {
    setSelectedLeadId(leadId)
    const target = myAssignedLeads.find(l => l.id === leadId)
    if (target) {
      setClientName(target.name || '')
      setClientPhone(target.phone || '')
      setClientEmail(target.email || '')
      setClientAddress(target.address || '')
      setClientJob(target.details || '')
      setTitle(`Booking — ${target.name}`)
    }
  }

  // Reliable Google Maps Autocomplete Initialization script loading hook
  useEffect(() => {
    const isBookingView = category === 'Booking' || category === 'Assigned Leads'
    if (!isBookingView) return

    const setupWidget = () => {
      if (!autocompleteInputRef.current || !(window as any).google?.maps?.places) return
      
      // Prevent multiple messy re-attachments on re-renders
      if (autocompleteInstance.current) return

      autocompleteInstance.current = new (window as any).google.maps.places.Autocomplete(autocompleteInputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'au' }
      })

      autocompleteInstance.current.addListener('place_changed', () => {
        const place = autocompleteInstance.current.getPlace()
        if (place.formatted_address) {
          setClientAddress(place.formatted_address)
        }
      })
    }

    if (!(window as any).google?.maps?.places) {
      // Check if tag is already injecting globally somewhere else
      const existingScript = document.getElementById('google-maps-autocomplete-script')
      if (!existingScript) {
        (window as any).initAutocompleteCallback = () => {
          setupWidget()
        }
        const script = document.createElement('script')
        script.id = 'google-maps-autocomplete-script'
        script.src = `https://maps.googleapis.com/maps/api/js?key=Maps+Demo+Key&libraries=places&callback=initAutocompleteCallback`
        script.async = true
        script.defer = true
        document.head.appendChild(script)
      }
    } else {
      setupWidget()
    }

    return () => {
      // Cleanup handlers cleanly if categories toggle
      if ((window as any).google && autocompleteInputRef.current) {
        (window as any).google.maps.event.clearInstanceListeners(autocompleteInputRef.current)
      }
      autocompleteInstance.current = null
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

  // Automatically adjust appointment text header string when tracking fields shift
  useEffect(() => {
    if ((category === 'Booking' || category === 'Assigned Leads') && clientName && !event?.id) {
      setTitle(`Booking — ${clientName}`)
    }
  }, [category, clientName])

  async function handleSave() {
    if (!title || !date || !startTime || !endTime) {
      setError('Please fill out all required layout fields.')
      return
    }
    setSaving(true)
    setError('')

    const finalLeadId = selectedLeadId || null

    const payload: Record<string, any> = {
      title,
      description,
      start_time: new Date(`${date}T${startTime}`).toISOString(),
      end_time: new Date(`${date}T${endTime}`).toISOString(),
      color,
      category,
      user_id: selectedUserId,
      lead_id: finalLeadId,
    }

    const capturesDetails = category === 'Booking' || category === 'Assigned Leads'
    if (capturesDetails) {
      payload.client_name = clientName
      payload.client_phone = clientPhone
      payload.client_email = clientEmail
      payload.client_address = clientAddress
      payload.client_job = clientJob
    }

    let dbError
    if (event?.id) {
      const result = await supabase.from('events').update(payload).eq('id', event.id)
      dbError = result.error
    } else {
      const result = await supabase.from('events').insert(payload)
      dbError = result.error

      // If appointment is saved, automatically flip lead status parameter to booked state
      if (!dbError && capturesDetails && finalLeadId) {
        await supabase
          .from('leads')
          .update({ status: 'booked' })
          .eq('id', finalLeadId)
      }
    }

    if (dbError) {
      setError('Error saving database event details: ' + dbError.message)
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
            {event?.id ? 'Edit System Event' : 'Schedule Appointment'}
          </h3>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* ASSIGNED LEADS LOOKUP DROPDOWN SELECTION GRID */}
            {category === 'Assigned Leads' && !event?.id && (
              <div>
                <label className="block text-sm font-medium text-amber-800 mb-1">Select an Assigned Lead to Pre-fill</label>
                <select
                  value={selectedLeadId}
                  onChange={e => handleLeadSelection(e.target.value)}
                  className="w-full border-2 border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- Click to choose from your leads list --</option>
                  {myAssignedLeads.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.service_type || 'General Service'})</option>
                  ))}
                </select>
              </div>
            )}

            {/* CLIENT CONFIGURATION DETAILS DETAILS SUBFORM */}
            {(category === 'Booking' || category === 'Assigned Leads') && (
              <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client Profile Details</p>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Customer Full Name</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mobile Contact Phone Number</label>
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={e => setClientPhone(e.target.value)}
                    placeholder="Enter phone numbers"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email Coordinates Address</label>
                  <input
                    type="text"
                    value={clientEmail}
                    onChange={e => setClientEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Job Site Address (Autocomplete Map Tracker)</label>
                  <input
                    ref={autocompleteInputRef}
                    type="text"
                    value={clientAddress}
                    onChange={e => setClientAddress(e.target.value)}
                    placeholder="Type words here to auto complete..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Task Details & Summary</label>
                  <textarea
                    value={clientJob}
                    onChange={e => setClientJob(e.target.value)}
                    placeholder="Describe specific task goals..."
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Entry Title *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="E.g., Initial onsite consultation"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplementary Workspace Description Notes</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="Optional internal remarks"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Appointment Calendar Date *</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              />
            </div>

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

            {profile?.role === 'manager' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member Owner Matrix Assignment</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Color Picker Label Identity Tag</label>
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
              {saving ? 'Processing...' : event?.id ? 'Update Layout' : 'Confirm Layout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}