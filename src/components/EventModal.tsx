// src/components/EventModal.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { cancelBooking } from '../lib/cancelBooking'
import { resolveBookingCustomerName } from '../lib/calendarBooking'
import {
  BOOKING_CATEGORY,
  TEAM_MEETING_CATEGORY,
  TEAM_MEETING_COLOR,
  getEmployeeColor,
} from '../lib/calendarColors'
import { logLeadEvent } from '../lib/leadEvents'
import { sendNotification } from '../lib/notify'
import { getPlatformUrl } from '../lib/env'
import { getAuthHeaders } from '../lib/apiAuth'
import { isManagerRole } from '../lib/roles'
import TimePicker from './TimePicker'
import { X, CalendarDays, Clock, User, FileText, MapPin, Phone, Briefcase, Link, Search, DollarSign, Users } from 'lucide-react'

interface OrgMember {
  id: string
  full_name: string
  phone?: string | null
}

interface Lead {
  id: string
  name: string
  service_type: string
  address?: string
  phone?: string
  email?: string
  details?: string
  assigned_to?: string
}

interface LeadSearchResult {
  id: string
  name: string
  phone: string
  service_type: string
  address?: string
  email?: string
  details?: string
}

interface Props {
  prefillLead?: Lead | null
  employees?: OrgMember[]
  defaultAssigneeId?: string
  onClose: () => void
  onSaved: () => void
  existingEvent?: {
    id: string
    title: string
    start_time: string
    end_time: string
    notes?: string
    lead_id?: string
    category?: string
    booking_group_id?: string | null
    client_name?: string
    client_phone?: string
    client_email?: string
    client_address?: string
    client_job?: string
    job_quote?: number | string | null
  }
  defaultDate?: string
}

// ── Timezone helper ──────────────────────────────────────────────────────────
// Combines a date string ("2026-06-18") and time string ("13:00") into a
// proper ISO 8601 string WITH the local timezone offset (e.g. +10:00 for AEST).
// Without this, Supabase treats the time as UTC and displays it 10 hours wrong.
function toLocalISO(dateStr: string, timeStr: string): string {
  // Build a Date object in local time
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const d = new Date(year, month - 1, day, hour, minute, 0, 0)

  // Get the local timezone offset in hours and minutes
  const offsetMs = d.getTimezoneOffset() * -1 // getTimezoneOffset returns negative for UTC+
  const offsetHours = Math.floor(Math.abs(offsetMs) / 60)
  const offsetMins = Math.abs(offsetMs) % 60
  const sign = offsetMs >= 0 ? '+' : '-'
  const offsetStr = `${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`

  // Build ISO string manually so the offset is baked in
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${offsetStr}`
}

// ── Derive display date/time from a stored ISO string ────────────────────────
// The stored value may be UTC. We need to display it in local time.
function localDateStr(isoStr: string): string {
  const d = new Date(isoStr)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localTimeStr(isoStr: string): string {
  const d = new Date(isoStr)
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${hour}:${minute}`
}

// ── Numeric-only sanitizer for the Job Quote field ────────────────────────────
// Strips anything that isn't a digit or a decimal point, and collapses
// multiple decimal points down to just the first one.
function sanitizeNumericInput(raw: string): string {
  const stripped = raw.replace(/[^0-9.]/g, '')
  const firstDot = stripped.indexOf('.')
  if (firstDot === -1) return stripped
  return stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, '')
}

type ManagerEventKind = 'picker' | 'booking' | 'meeting'

function initialEventKind(
  isManager: boolean,
  existingEvent: Props['existingEvent'],
  prefillLead: Lead | null | undefined,
): ManagerEventKind | 'employee' {
  if (prefillLead) return 'booking'
  if (existingEvent) {
    return existingEvent.category === TEAM_MEETING_CATEGORY ? 'meeting' : 'booking'
  }
  if (isManager) return 'picker'
  return 'employee'
}

export default function EventModal({
  prefillLead,
  employees = [],
  defaultAssigneeId,
  onClose,
  onSaved,
  existingEvent,
  defaultDate,
}: Props) {
  const { profile } = useAuth()
  const isManager = isManagerRole(profile?.role)
  const resolvedKind = initialEventKind(isManager, existingEvent, prefillLead)
  const [eventKind, setEventKind] = useState<ManagerEventKind | 'employee'>(resolvedKind)
  const [meetingAttendees, setMeetingAttendees] = useState<OrgMember[]>([])
  const [loadingAttendees, setLoadingAttendees] = useState(false)

  const isLeaveEvent = existingEvent?.category === 'Leave'
  const isExistingTeamMeeting = existingEvent?.category === TEAM_MEETING_CATEGORY
  const isTeamMeetingMode = eventKind === 'meeting'
  const isBookingMode = eventKind === 'booking' || eventKind === 'employee'
  const showTypePicker = eventKind === 'picker'
  const memberList = employees.length > 0 ? employees : (profile ? [{ id: profile.id, full_name: profile.full_name ?? 'You' }] : [])
  const canCancelBooking = Boolean(existingEvent?.id && !isLeaveEvent)
  // not UTC. Previously used .split('T') which ignored the timezone offset.
  const initialDate = existingEvent
    ? localDateStr(existingEvent.start_time)
    : defaultDate
      ? defaultDate.split('T')[0]
      : new Date().toISOString().split('T')[0]

  const initialStartTime = existingEvent
    ? localTimeStr(existingEvent.start_time)
    : defaultDate
      ? defaultDate.slice(11, 16)
      : '09:00'

  const [title, setTitle] = useState(existingEvent?.title ?? (prefillLead ? `${prefillLead.service_type} — ${prefillLead.name}` : ''))
  const [date, setDate] = useState(initialDate)
  const [startTime, setStartTime] = useState(initialStartTime)
  const [endTime, setEndTime] = useState(existingEvent ? localTimeStr(existingEvent.end_time) : '10:00')
  const [notes, setNotes] = useState(existingEvent?.notes ?? '')

  const [clientName, setClientName] = useState(existingEvent?.client_name ?? prefillLead?.name ?? '')
  const [clientPhone, setClientPhone] = useState(existingEvent?.client_phone ?? prefillLead?.phone ?? '')
  const [clientEmail, setClientEmail] = useState(existingEvent?.client_email ?? prefillLead?.email ?? '')
  const [clientAddress, setClientAddress] = useState(existingEvent?.client_address ?? prefillLead?.address ?? '')
  const [clientJob, setClientJob] = useState(existingEvent?.client_job ?? prefillLead?.details ?? prefillLead?.service_type ?? '')
  const [jobQuote, setJobQuote] = useState(
    existingEvent?.job_quote !== undefined && existingEvent?.job_quote !== null
      ? String(existingEvent.job_quote)
      : ''
  )

  const [linkedLeadId, setLinkedLeadId] = useState<string | null>(
    prefillLead?.id ?? existingEvent?.lead_id ?? null
  )
  const [linkedLeadName, setLinkedLeadName] = useState<string>('')
  const [leadSearch, setLeadSearch] = useState('')
  const [leadResults, setLeadResults] = useState<LeadSearchResult[]>([])
  const [searchingLeads, setSearchingLeads] = useState(false)
  const [showLeadSearch, setShowLeadSearch] = useState(false)

  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelPanel, setShowCancelPanel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [error, setError] = useState('')

  const initialAssigneeId = defaultAssigneeId ?? prefillLead?.assigned_to ?? profile?.id ?? ''
  const [assigneeId, setAssigneeId] = useState(initialAssigneeId)
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>(() => {
    const ids = new Set<string>()
    if (profile?.id) ids.add(profile.id)
    if (defaultAssigneeId) ids.add(defaultAssigneeId)
    return [...ids]
  })

  useEffect(() => {
    if (existingEvent?.lead_id && !prefillLead) {
      supabase
        .from('leads')
        .select('id, name, service_type')
        .eq('id', existingEvent.lead_id)
        .single()
        .then(({ data }) => {
          if (data) setLinkedLeadName(`${data.name} — ${data.service_type}`)
        })
    } else if (prefillLead) {
      setLinkedLeadName(`${prefillLead.name} — ${prefillLead.service_type}`)
    }
  }, [existingEvent?.lead_id, prefillLead])

  useEffect(() => {
    if (prefillLead?.assigned_to) {
      setAssigneeId(prefillLead.assigned_to)
    }
  }, [prefillLead?.assigned_to])

  useEffect(() => {
    if (prefillLead && !existingEvent) {
      setTitle(`${prefillLead.service_type} — ${prefillLead.name}`)
      setClientName(prefillLead.name)
      setClientPhone(prefillLead.phone ?? '')
      setClientEmail(prefillLead.email ?? '')
      setClientAddress(prefillLead.address ?? '')
      setClientJob(prefillLead.details ?? prefillLead.service_type)
      setLinkedLeadId(prefillLead.id)
      setLinkedLeadName(`${prefillLead.name} — ${prefillLead.service_type}`)
    }
  }, [prefillLead, existingEvent])

  useEffect(() => {
    if (!isExistingTeamMeeting || !existingEvent?.booking_group_id || !profile?.org_id) return
    setLoadingAttendees(true)
    supabase
      .from('events')
      .select('user_id, profiles(full_name)')
      .eq('booking_group_id', existingEvent.booking_group_id)
      .eq('org_id', profile.org_id)
      .then(({ data }) => {
        if (data) {
          setMeetingAttendees(
            data.map((row) => ({
              id: row.user_id as string,
              full_name: (row.profiles as { full_name?: string } | null)?.full_name ?? 'Team member',
            })),
          )
        }
        setLoadingAttendees(false)
      })
  }, [isExistingTeamMeeting, existingEvent?.booking_group_id, profile?.org_id])

  function chooseBooking() {
    setEventKind('booking')
    setShowLeadSearch(true)
    setError('')
  }

  function chooseMeeting() {
    setEventKind('meeting')
    setLinkedLeadId(null)
    setLinkedLeadName('')
    setClientName('')
    setClientPhone('')
    setClientEmail('')
    setClientAddress('')
    setClientJob('')
    setJobQuote('')
    setError('')
  }

  useEffect(() => {
    if (!leadSearch.trim() || leadSearch.length < 2) {
      setLeadResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchingLeads(true)
      const { data } = await supabase
        .from('leads')
        .select('id, name, phone, service_type, address, email, details')
        .eq('org_id', profile?.org_id)
        .or(`name.ilike.%${leadSearch}%,phone.ilike.%${leadSearch}%,service_type.ilike.%${leadSearch}%`)
        .limit(6)
      setLeadResults((data as LeadSearchResult[]) ?? [])
      setSearchingLeads(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [leadSearch, profile?.org_id])

  function selectLead(lead: LeadSearchResult) {
    setLinkedLeadId(lead.id)
    setLinkedLeadName(`${lead.name} — ${lead.service_type}`)
    setClientName(lead.name)
    setClientPhone(lead.phone ?? '')
    setClientEmail(lead.email ?? '')
    setClientAddress(lead.address ?? '')
    setClientJob(lead.details ?? lead.service_type)
    if (!title) setTitle(`${lead.service_type} — ${lead.name}`)
    setLeadSearch('')
    setLeadResults([])
    setShowLeadSearch(false)
  }

  function unlinkLead() {
    setLinkedLeadId(null)
    setLinkedLeadName('')
  }

  function toggleTeamMember(memberId: string) {
    setTeamMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    )
  }

  function formatBookingDateTime(startISO: string, timeLabel: string): string {
    const formattedDate = new Date(startISO).toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    return `${formattedDate} ${timeLabel}`
  }

  async function notifyAssignees(assigneeIds: string[], startISO: string) {
    const dateTime = formatBookingDateTime(startISO, startTime)
    const managerName = profile?.full_name ?? 'Your manager'
    const message = `${managerName} scheduled "${title}" on your calendar — ${dateTime}`
    const url = `${getPlatformUrl()}/calendar`

    for (const id of assigneeIds.filter((uid) => uid !== profile?.id)) {
      await sendNotification(id, 'New Booking Scheduled', message, url, 'calendar')

      const emp = employees.find((e) => e.id === id)
      if (!emp?.phone) continue
      try {
        const headers = await getAuthHeaders()
        await fetch('/api/send-sms', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mode: 'booking_scheduled',
            to: emp.phone,
            leadName: title,
            serviceType: clientJob.trim() || title,
            dateTime,
            managerName,
          }),
        })
      } catch (smsErr) {
        console.error('Booking SMS failed:', smsErr)
      }
    }
  }

  // Notify the manager when an employee creates or updates a calendar event.
  // Runs in its own try/catch so a notification failure never blocks the save.
  async function notifyManager(action: 'scheduled' | 'updated') {
    if (profile?.role !== 'employee') return
    try {
      const { data: empProfile, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, manager_id')
        .eq('id', profile.id)
        .single()

      if (profileError || !empProfile?.manager_id) return

      const employeeName = `${empProfile.first_name || 'An employee'} ${empProfile.last_name || ''}`.trim()

      await supabase
        .from('notifications')
        .insert([{
          user_id: empProfile.manager_id,
          title: 'Calendar Updated',
          message: `${employeeName} ${action} an appointment: "${title}"`,
          type: 'calendar',
          read: false,
          org_id: profile.org_id
        }])
    } catch (err) {
      console.warn('Manager notification failed (non-fatal):', err)
    }
  }

  async function handleSave() {
    if (!title.trim()) { setError('Please add a title'); return }
    setSaving(true)
    setError('')

    const startISO = toLocalISO(date, startTime)
    const endISO = toLocalISO(date, endTime)
    const customerName = clientName.trim()
    const nowIso = new Date().toISOString()
    const teamMeeting = isTeamMeetingMode

    if (isBookingMode && !linkedLeadId && !customerName) {
      setError('Link a lead or enter the customer full name to book.')
      setSaving(false)
      return
    }

    if (teamMeeting && teamMemberIds.length === 0) {
      setError('Select at least one team member for the meeting.')
      setSaving(false)
      return
    }

    const bookingAssigneeId = isManager && isBookingMode ? assigneeId : (profile?.id ?? '')
    if (!bookingAssigneeId && isBookingMode) {
      setError('Please select who this booking is for.')
      setSaving(false)
      return
    }

    // ── Team meeting (manager only, no lead) ──────────────────────────────
    if (teamMeeting) {
      const baseEvent = {
        title,
        start_time: startISO,
        end_time: endISO,
        notes,
        lead_id: null,
        client_name: null,
        client_phone: null,
        client_email: null,
        client_address: null,
        client_job: null,
        job_quote: null,
        org_id: profile?.org_id,
        category: TEAM_MEETING_CATEGORY,
        color: TEAM_MEETING_COLOR,
      }

      if (existingEvent?.booking_group_id) {
        const { error: e } = await supabase
          .from('events')
          .update({
            title: baseEvent.title,
            start_time: baseEvent.start_time,
            end_time: baseEvent.end_time,
            notes: baseEvent.notes,
          })
          .eq('booking_group_id', existingEvent.booking_group_id)
        if (e) { setError(e.message); setSaving(false); return }
      } else if (existingEvent) {
        const { error: e } = await supabase
          .from('events')
          .update(baseEvent)
          .eq('id', existingEvent.id)
        if (e) { setError(e.message); setSaving(false); return }
      } else {
        const bookingGroupId = crypto.randomUUID()
        const rows = teamMemberIds.map((userId) => ({
          ...baseEvent,
          user_id: userId,
          booking_group_id: bookingGroupId,
        }))
        const { error: e } = await supabase.from('events').insert(rows)
        if (e) { setError(e.message); setSaving(false); return }
        await notifyAssignees(teamMemberIds, startISO)
      }

      onSaved()
      onClose()
      return
    }

    // ── Job booking (lead linked or customer creates lead) ─────────────────
    let leadIdToUse = linkedLeadId

    if (!leadIdToUse && customerName) {
      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert({
          org_id: profile?.org_id,
          name: customerName,
          phone: clientPhone || null,
          email: clientEmail || null,
          address: clientAddress || null,
          service_type: clientJob.trim() || title.trim() || 'General Enquiry',
          details: clientJob || null,
          status: 'booked',
          assigned_to: bookingAssigneeId || null,
          assigned_at: bookingAssigneeId ? nowIso : null,
          source: 'manual',
          lead_source: 'Calendar Booking',
        })
        .select()
        .single()

      if (leadError) {
        setError('Could not create lead: ' + leadError.message)
        setSaving(false)
        return
      }
      leadIdToUse = newLead.id
      setLinkedLeadId(newLead.id)

      await logLeadEvent({
        leadId: newLead.id,
        orgId: profile?.org_id ?? null,
        eventType: 'created',
        note: `Lead created from calendar booking: "${title}"`,
        actorId: profile?.id ?? null,
        payload: {
          source: 'manual',
          lead_source: 'Calendar Booking',
          assigned_to: bookingAssigneeId,
        },
      })
    } else if (leadIdToUse) {
      const { data: currentLead } = await supabase
        .from('leads')
        .select('status')
        .eq('id', leadIdToUse)
        .single()

      const terminalStatuses = ['lost', 'completed', 'booking_cancelled']
      const leadUpdate: Record<string, unknown> = {
        name: customerName || resolveBookingCustomerName(clientName, title),
        phone: clientPhone,
        email: clientEmail,
        address: clientAddress,
        details: clientJob,
      }
      if (!currentLead?.status || !terminalStatuses.includes(currentLead.status)) {
        leadUpdate.status = 'booked'
      }
      if (!existingEvent && bookingAssigneeId) {
        leadUpdate.assigned_to = bookingAssigneeId
        leadUpdate.assigned_at = nowIso
      }

      const { error: leadUpdateError } = await supabase
        .from('leads')
        .update(leadUpdate)
        .eq('id', leadIdToUse)

      if (leadUpdateError) {
        setError('Could not update lead: ' + leadUpdateError.message)
        setSaving(false)
        return
      }
    }

    const eventColor = getEmployeeColor(bookingAssigneeId, memberList)
    const eventData = {
      title,
      start_time: startISO,
      end_time: endISO,
      notes,
      client_name: customerName || null,
      client_phone: clientPhone || null,
      client_email: clientEmail || null,
      client_address: clientAddress || null,
      client_job: clientJob || null,
      job_quote: jobQuote.trim() === '' ? null : Number(jobQuote),
      lead_id: leadIdToUse ?? null,
      user_id: bookingAssigneeId,
      org_id: profile?.org_id,
      category: leadIdToUse || customerName ? BOOKING_CATEGORY : null,
      color: eventColor,
    }

    if (existingEvent) {
      const { error: e } = await supabase
        .from('events')
        .update(eventData)
        .eq('id', existingEvent.id)
      if (e) { setError(e.message); setSaving(false); return }
      await notifyManager('updated')
    } else {
      const { error: e } = await supabase
        .from('events')
        .insert(eventData)
      if (e) { setError(e.message); setSaving(false); return }
      if (leadIdToUse) {
        await logLeadEvent({
          leadId: leadIdToUse,
          orgId: profile?.org_id ?? null,
          eventType: 'booked',
          note: `Booking scheduled: "${title}"`,
          actorId: profile?.id ?? null,
          payload: {
            start_time: startISO,
            end_time: endISO,
            booked_by: profile?.id ?? null,
            assigned_to: bookingAssigneeId,
            job_quote: jobQuote.trim() === '' ? null : Number(jobQuote),
          },
        })
      }
      await notifyManager('scheduled')
      if (isManager && bookingAssigneeId !== profile?.id) {
        await notifyAssignees([bookingAssigneeId], startISO)
      }
    }

    onSaved()
    onClose()
  }

  async function handleCancelBooking() {
    if (!existingEvent?.id || !profile?.org_id || !profile?.id) return
    if (!window.confirm(
      'Cancel this booking? It will be removed from the calendar. The linked lead will be kept as Booking Cancelled.'
    )) return

    setCancelling(true)
    setError('')

    const appointmentDate = localDateStr(existingEvent.start_time)
    const result = await cancelBooking({
      eventId: existingEvent.id,
      leadId: linkedLeadId ?? existingEvent.lead_id ?? null,
      bookingGroupId: existingEvent.booking_group_id ?? null,
      orgId: profile.org_id,
      actorId: profile.id,
      actorRole: profile.role,
      title: title || existingEvent.title,
      reason: cancelReason,
      appointmentDate,
    })

    if (result.error) {
      setError(result.error)
      setCancelling(false)
      return
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
              {showTypePicker
                ? 'Create on calendar'
                : existingEvent
                  ? (isExistingTeamMeeting ? 'Edit Team Meeting' : 'Edit Appointment')
                  : (isTeamMeetingMode ? 'Schedule Team Meeting' : 'Book Appointment')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {showTypePicker && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">What would you like to schedule?</p>
              <button
                type="button"
                onClick={chooseBooking}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-[#004B93]/20 bg-[#004B93]/5 hover:border-[#004B93]/50 hover:bg-[#004B93]/10 transition text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[#004B93] text-white flex items-center justify-center shrink-0">
                  <Briefcase size={18} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Booking</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Customer job — link a lead, assign to one technician, updates kanban.
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={chooseMeeting}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-violet-200 bg-violet-50 hover:border-violet-400 hover:bg-violet-100/60 transition text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-violet-600 text-white flex items-center justify-center shrink-0">
                  <Users size={18} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Team meeting</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Internal planning — pick attendees, purple on calendars, no lead created.
                  </p>
                </div>
              </button>
            </div>
          )}

          {!showTypePicker && isManager && !existingEvent && (
            <button
              type="button"
              onClick={() => setEventKind('picker')}
              className="text-xs text-gray-400 hover:text-[#004B93] font-medium"
            >
              ← Change type
            </button>
          )}

          {/* Team meeting — pick attendees (new) */}
          {!showTypePicker && isManager && memberList.length > 0 && isTeamMeetingMode && !existingEvent && (
            <div className="bg-violet-50/50 rounded-xl p-3 border border-violet-100">
              <p className="text-xs font-semibold text-violet-800 flex items-center gap-1 mb-2">
                <Users size={11} />
                Who is attending?
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {memberList.map((emp) => (
                  <label
                    key={emp.id}
                    className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-violet-100/50"
                  >
                    <input
                      type="checkbox"
                      checked={teamMemberIds.includes(emp.id)}
                      onChange={() => toggleTeamMember(emp.id)}
                      className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="truncate">{emp.full_name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Booking — assign to one technician */}
          {!showTypePicker && isManager && memberList.length > 0 && isBookingMode && !existingEvent && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Assign to</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#004B93] bg-white"
              >
                {memberList.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Team meeting — attendees (existing) */}
          {isExistingTeamMeeting && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-violet-800 flex items-center gap-1 mb-2">
                <Users size={11} />
                Attendees
              </p>
              {loadingAttendees ? (
                <p className="text-xs text-violet-600">Loading…</p>
              ) : meetingAttendees.length > 0 ? (
                <ul className="space-y-1">
                  {meetingAttendees.map((emp) => (
                    <li key={emp.id} className="text-sm text-violet-900 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                      {emp.full_name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-violet-600">No attendees found.</p>
              )}
              <p className="text-[10px] text-violet-600/80 mt-2">
                Edits to time and title apply to everyone&apos;s calendar.
              </p>
            </div>
          )}

          {/* Lead Link — booking only */}
          {!showTypePicker && isBookingMode && (
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                <Link size={11} />
                Linked Lead
              </p>
              {!linkedLeadId && !showLeadSearch && (
                <button
                  onClick={() => setShowLeadSearch(true)}
                  className="text-xs text-[#004B93] font-medium hover:underline flex items-center gap-1"
                >
                  <Search size={11} /> Search leads
                </button>
              )}
            </div>

            {linkedLeadId ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <span className="text-sm text-blue-800 font-medium truncate">{linkedLeadName || 'Lead linked'}</span>
                <button onClick={unlinkLead} className="text-blue-400 hover:text-blue-600 ml-2 shrink-0" title="Unlink lead">
                  <X size={14} />
                </button>
              </div>
            ) : showLeadSearch ? (
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  value={leadSearch}
                  onChange={e => setLeadSearch(e.target.value)}
                  placeholder="Search by name, phone, or service…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
                />
                {searchingLeads && <p className="text-xs text-gray-400 mt-1 px-1">Searching…</p>}
                {leadResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    {leadResults.map(lead => (
                      <button
                        key={lead.id}
                        onClick={() => selectLead(lead)}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition border-b border-gray-100 last:border-0"
                      >
                        <p className="text-sm font-medium text-gray-800">{lead.name}</p>
                        <p className="text-xs text-gray-500">{lead.service_type} · {lead.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { setShowLeadSearch(false); setLeadSearch(''); setLeadResults([]) }}
                  className="text-xs text-gray-400 hover:text-gray-600 mt-1"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No lead linked. Customer details entered manually.</p>
            )}
          </div>
          )}

          {/* Customer Info — booking only */}
          {!showTypePicker && isBookingMode && (
          <div className="bg-[#004B93]/5 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-[#004B93] uppercase tracking-wide">Customer Information</p>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
                />
              </div>
            </div>
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <DollarSign size={11} className="inline mr-1" />Job Quote / Estimate
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={jobQuote}
                onChange={e => setJobQuote(sanitizeNumericInput(e.target.value))}
                placeholder="0.00"
                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
              />
            </div>
          </div>
          )}

          {/* Appointment Details */}
          {!showTypePicker && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Appointment Details</p>
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
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-2 border-t border-gray-100 shrink-0 space-y-3">
          {canCancelBooking && showCancelPanel && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-red-700">Cancellation reason (optional)</p>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                rows={2}
                placeholder="Why was this booking cancelled?"
                className="w-full px-3 py-2 rounded-lg border border-red-200 text-sm focus:outline-none focus:border-red-400 resize-none bg-white"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCancelPanel(false); setCancelReason('') }}
                  disabled={cancelling}
                  className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-100/50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCancelBooking}
                  disabled={cancelling}
                  className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving || cancelling}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || cancelling || showTypePicker}
              className="flex-1 py-2.5 rounded-xl bg-[#004B93] text-white text-sm font-semibold hover:bg-[#003d7a] transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : existingEvent ? 'Save Changes' : (isTeamMeetingMode ? 'Schedule Meeting' : 'Book Appointment')}
            </button>
          </div>

          {canCancelBooking && !showCancelPanel && (
            <button
              type="button"
              onClick={() => setShowCancelPanel(true)}
              disabled={saving || cancelling}
              className="w-full py-2.5 rounded-xl border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-60"
            >
              Cancel Booking
            </button>
          )}
        </div>
      </div>
    </div>
  )
}