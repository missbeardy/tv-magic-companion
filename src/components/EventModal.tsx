import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import TimePicker from './TimePicker'
import { sendPushNotification } from '../lib/sendPush'

// ── Types ───────────────────────────────────────────────────────────────────

interface Lead {
  id: string
  name: string
  phone: string
  email: string
  details: string
  service_type: string
  address?: string
}

interface CalendarEvent {
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

interface EventPayload {
  title: string
  description: string | undefined
  start_time: string
  end_time: string
  color: string
  category: string
  user_id: string
  lead_id: string | null
  client_name?: string
  client_phone?: string
  client_email?: string
  client_address?: string
  client_job?: string
}

interface Props {
  event?: CalendarEvent | null
  defaultDate?: string
  prefillLead?: Lead | null
  onClose: () => void
  onSaved: () => void
}

// ── Constants ─────────────────────────────────────────────────────────────

const CATEGORIES = ['General', 'Booking', 'Assigned Leads', 'Internal']

const COLORS = ['#004B93', '#00B4C5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function isBookingCategory(category: string): boolean {
  return category === 'Booking' || category === 'Assigned Leads'
}

function validateTimes(startTime: string, endTime: string, date: string): string | null {
  const start = new Date(`${date}T${startTime}`)
  const end = new Date(`${date}T${endTime}`)
  if (end <= start) {
    return 'End time must be after start time.'
  }
  return null
}

// ── Component ───────────────────────────────────────────────────────────────

export default function EventModal({ event, defaultDate, prefillLead, onClose, onSaved }: Props) {
  const { profile } = useAuth()

  // ── Derived initial values ──
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

  // ── Form State ──
  const [title, setTitle] = useState(event?.title || '')
  const [description, setDescription] = useState(event?.description || '')
  const [date, setDate] = useState(initDate)
  const [startTime, setStartTime] = useState(initStartTime)
  const [endTime, setEndTime] = useState(initEndTime)
  const [color, setColor] = useState(event?.color || '#004B93')
  const [category, setCategory] = useState(event?.category || (prefillLead ? 'Booking' : 'General'))

  // Lead selection
  const [myAssignedLeads, setMyAssignedLeads] = useState<Lead[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string>(event?.lead_id || prefillLead?.id || '')

  // Client details
  const [clientName, setClientName] = useState(event?.client_name || prefillLead?.name || '')
  const [clientPhone, setClientPhone] = useState(event?.client_phone || prefillLead?.phone || '')
  const [clientEmail, setClientEmail] = useState(event?.client_email || prefillLead?.email || '')
  const [clientAddress, setClientAddress] = useState(event?.client_address || prefillLead?.address || '')
  const [clientJob, setClientJob] = useState(event?.client_job || prefillLead?.details || '')

  // Employee assignment
  const [selectedUserId, setSelectedUserId] = useState(event?.user_id || profile?.id || '')
  const [employees, setEmployees] = useState<Profile[]>([])

  // UI State
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ── Fetch My Assigned Leads ──
  useEffect(() => {
    const userId = profile?.id
    if (!userId) return

    let cancelled = false

    async function fetchMyLeads() {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('assigned_to', userId)
        .eq('status', 'assigned')

      if (!cancelled && data) {
        setMyAssignedLeads(data as Lead[])
      }
    }

    fetchMyLeads()
    return () => { cancelled = true }
  }, [profile])

  // ── Handle Lead Selection ──
  const handleLeadSelection = useCallback((leadId: string) => {
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
  }, [myAssignedLeads])

  // ── Fetch Employees (Manager only) ──
  useEffect(() => {
    if (profile?.role !== 'manager') return

    let cancelled = false

    supabase
      .from('profiles')
      .select('id, full_name')
      .then(({ data }) => {
        if (!cancelled && data) setEmployees(data)
      })

    return () => { cancelled = true }
  }, [profile])

  // ── Auto-update title for bookings ──
  useEffect(() => {
    if (isBookingCategory(category) && clientName && !event?.id) {
      setTitle(`Booking — ${clientName}`)
    }
  }, [category, clientName, event?.id])

  // ── Save Handler ──
  const handleSave = useCallback(async () => {
    if (!title || !date || !startTime || !endTime) {
      setError('Please fill out all required fields.')
      return
    }

    const timeError = validateTimes(startTime, endTime, date)
    if (timeError) {
      setError(timeError)
      return
    }

    setSaving(true)
    setError('')

    const finalLeadId = selectedLeadId || null

    const payload: EventPayload = {
      title,
      description,
      start_time: new Date(`${date}T${startTime}`).toISOString(),
      end_time: new Date(`${date}T${endTime}`).toISOString(),
      color,
      category,
      user_id: selectedUserId,
      lead_id: finalLeadId,
    }

    const capturesDetails = isBookingCategory(category)
    if (capturesDetails) {
      payload.client_name = clientName
      payload.client_phone = clientPhone
      payload.client_email = clientEmail
      payload.client_address = clientAddress
      payload.client_job = clientJob
    }

    try {
      let dbError: Error | null = null
      let previousLeadId: string | null = event?.lead_id ?? null

      if (event?.id) {
        const { error } = await supabase
          .from('events')
          .update(payload)
          .eq('id', event.id)
        dbError = error

        if (!dbError && capturesDetails && finalLeadId !== previousLeadId) {
          if (previousLeadId) {
            await supabase
              .from('leads')
              .update({ status: 'assigned' })
              .eq('id', previousLeadId)
          }
          if (finalLeadId) {
            await supabase
              .from('leads')
              .update({ status: 'booked' })
              .eq('id', finalLeadId)
          }
        }
      } else {
        const { error } = await supabase.from('events').insert(payload)
        dbError = error

        if (!dbError && capturesDetails && finalLeadId) {
          await supabase
            .from('leads')
            .update({ status: 'booked' })
            .eq('id', finalLeadId)
        }
      }

      if (dbError) {
        setError('Error saving event: ' + dbError.message)
      } else {
        if (selectedUserId && selectedUserId !== profile?.id) {
          const action = event?.id ? 'updated' : 'created'
          await sendPushNotification(
            selectedUserId,
            'Calendar Update',
            `${action === 'created' ? 'New' : 'Updated'} appointment: ${title}`,
            '/calendar'
          )
        }
        onSaved()
        onClose()
      }
    } catch (err) {
      setError('Unexpected error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }, [
    title, description, date, startTime, endTime, color, category,
    selectedUserId, selectedLeadId, clientName, clientPhone, clientEmail,
    clientAddress, clientJob, event, onSaved, onClose
  ])

  // ── Delete Handler ──
  const handleDelete = useCallback(async () => {
    if (!event?.id) return

    try {
      if (event.lead_id) {
        await supabase
          .from('leads')
          .update({ status: 'assigned' })
          .eq('id', event.lead_id)
      }

      await supabase.from('events').delete().eq('id', event.id)
      onSaved()
      onClose()
    } catch (err) {
      setError('Error deleting event: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }, [event, onSaved, onClose])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {event?.id ? 'Edit Event' : 'Schedule Appointment'}
          </h3>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
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

            {/* Assigned Lead Dropdown */}
            {category === 'Assigned Leads' && !event?.id && (
              <div>
                <label className="block text-sm font-medium text-amber-800 mb-1">
                  Select an Assigned Lead to Pre-fill
                </label>
                <select
                  value={selectedLeadId}
                  onChange={e => handleLeadSelection(e.target.value)}
                  className="w-full border-2 border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- Choose from your leads --</option>
                  {myAssignedLeads.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.service_type || 'General Service'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Client Details */}
            {isBookingCategory(category) && (
              <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Client Details
                </p>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={e => setClientPhone(e.target.value)}
                    placeholder="Enter phone number"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
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
                    placeholder="name@domain.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={clientAddress}
                    onChange={e => setClientAddress(e.target.value)}
                    placeholder="Enter address"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Job Details
                  </label>
                  <textarea
                    value={clientJob}
                    onChange={e => setClientJob(e.target.value)}
                    placeholder="Describe the job..."
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                  />
                </div>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="E.g., Initial onsite consultation"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="Optional internal notes"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              />
            </div>

            {/* Time Range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time *
                </label>
                <TimePicker value={startTime} onChange={setStartTime} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time *
                </label>
                <TimePicker value={endTime} onChange={setEndTime} />
              </div>
            </div>

            {/* Employee Assignment (Manager only) */}
            {profile?.role === 'manager' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assign To
                </label>
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

            {/* Color Picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color
              </label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition ${
                      color === c ? 'border-gray-800 scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
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