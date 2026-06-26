// src/components/Calendar.tsx

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useOrgProfiles } from '../hooks/useOrgProfiles'
import { isManagerRole } from '../lib/roles'
import {
  buildEmployeeColorMap,
  dedupeTeamMeetingsForAggregatedView,
  getEventDisplayColor,
  isTeamMeetingCategory,
  countTeamMeetingAttendees,
  TEAM_MEETING_COLOR,
} from '../lib/calendarColors'
import EventModal from './EventModal'
import BlackoutModal from './BlackoutModal'
import { MobileResourceView } from './MobileResourceView'
// Converts a Date to "YYYY-MM-DDTHH:mm" using LOCAL time components.
// .toISOString() converts to UTC, which rolls the date back a day for
// any timezone ahead of UTC (like AEST) during early local hours.
function toLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Types ───────────────────────────────────────────────────────────────────

interface Event {
  id: string
  title: string
  description?: string
  start_time: string
  end_time: string
  user_id: string
  color: string
  category?: string
  client_name?: string
  client_phone?: string
  client_email?: string
  client_address?: string
  client_job?: string
  job_quote?: string | number | null
  lead_id?: string
  booking_group_id?: string | null
  profiles?: { full_name: string }
}

interface Profile {
  id: string
  full_name: string
  phone?: string | null
}

type ViewMode = 'day' | 'week' | 'month'

// ── Constants ───────────────────────────────────────────────────────────────

const DAY_START_HOUR = 6
const DAY_END_HOUR = 20
const SLOT_HEIGHT = 64
const HOUR_LABELS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i
)

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const fullDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  // Parse as UTC, display in local time
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })
}

function formatDuration(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

function getEventTop(startTime: string): number {
  const d = new Date(startTime)
  // getHours() and getMinutes() already return local time — this is correct
  const hour = d.getHours()
  const minute = d.getMinutes()
  if (hour < DAY_START_HOUR) return 0
  if (hour > DAY_END_HOUR) return (DAY_END_HOUR - DAY_START_HOUR) * SLOT_HEIGHT
  return ((hour - DAY_START_HOUR) + minute / 60) * SLOT_HEIGHT
}

function getEventHeight(startTime: string, endTime: string): number {
  const start = new Date(startTime)
  const end = new Date(endTime)
  const diffMs = end.getTime() - start.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  return Math.max(diffHours * SLOT_HEIGHT, 28)
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

function isTimeSlotAvailable(
  events: Event[],
  date: Date,
  hour: number,
  durationMinutes: number = 60
): boolean {
  const slotStart = new Date(date)
  slotStart.setHours(hour, 0, 0, 0)
  const slotEnd = new Date(slotStart)
  slotEnd.setMinutes(slotStart.getMinutes() + durationMinutes)

  return !events.some(event => {
    const eventStart = new Date(event.start_time)
    const eventEnd = new Date(event.end_time)
    return slotStart < eventEnd && slotEnd > eventStart
  })
}

function getAvailabilityForDay(
  events: Event[],
  date: Date,
  durationMinutes: number = 60
): { hour: number; available: boolean }[] {
  return HOUR_LABELS.map(hour => ({
    hour,
    available: isTimeSlotAvailable(events, date, hour, durationMinutes),
  }))
}

function isLeaveEvent(e: Event): boolean {
  return e.category === 'Leave'
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Calendar() {
  const { profile } = useAuth()
  const { fetchOrgProfiles } = useOrgProfiles()
  const [searchParams] = useSearchParams()
  const [events, setEvents] = useState<Event[]>([])
  const [view, setView] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showBlackoutModal, setShowBlackoutModal] = useState(false)
  const [defaultDate, setDefaultDate] = useState('')
  const [employees, setEmployees] = useState<Profile[]>([])
  const [filterEmployee, setFilterEmployee] = useState<string>('all')
  const [isMobile, setIsMobile] = useState(false)
  const [isTabletUp, setIsTabletUp] = useState(false)
  const [showAvailability, setShowAvailability] = useState(false)
  const [availabilityDuration, setAvailabilityDuration] = useState(60)
  const [availabilityEmployee, setAvailabilityEmployee] = useState<string>('all')

  const showResourceView = isMobile && isManagerRole(profile?.role) && filterEmployee === 'all' && view !== 'month'

  const employeeColorMap = useMemo(() => buildEmployeeColorMap(employees), [employees])

  function eventColor(event: Event): string {
    return getEventDisplayColor(event, employeeColorMap)
  }

  const showAggregatedAllEmployees = isManagerRole(profile?.role) && filterEmployee === 'all'

  function getTimedEventsForDay(date: Date): Event[] {
    const timed = getEventsForDay(date).filter((e) => !isLeaveEvent(e))
    return showAggregatedAllEmployees ? dedupeTeamMeetingsForAggregatedView(timed) : timed
  }

  function teamMeetingAttendeeLabel(event: Event): string | null {
    if (!isTeamMeetingCategory(event.category) || !event.booking_group_id) return null
    const count = countTeamMeetingAttendees(events, event.booking_group_id)
    return count > 1 ? `👥 ${count} people` : '👥 Team meeting'
  }

  useEffect(() => {
    const employeeParam = searchParams.get('employee')
    if (employeeParam && isManagerRole(profile?.role)) {
      setFilterEmployee(employeeParam)
    }
  }, [searchParams, profile?.role])

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768)
      setIsTabletUp(window.innerWidth >= 640)
    }
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  function getQueryRange(date: Date, viewMode: ViewMode): { start: Date; end: Date } {
    switch (viewMode) {
      case 'day':
        return { start: startOfDay(date), end: endOfDay(date) }
      case 'week': {
        // On tablet/desktop we show 2 weeks at once, so pull 14 days of events
        const weekEnd = isTabletUp
          ? new Date(endOfWeek(date).getTime() + 7 * 24 * 60 * 60 * 1000)
          : endOfWeek(date)
        return { start: startOfWeek(date), end: weekEnd }
      }
      case 'month':
        return { start: startOfMonth(date), end: endOfMonth(date) }
    }
  }

  async function fetchEvents() {
    if (!profile?.org_id) return

    const { start, end } = getQueryRange(currentDate, view)

    let query = supabase
      .from('events')
      .select('*, profiles(full_name)')
      .eq('org_id', profile.org_id)
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString())
      .order('start_time', { ascending: true })

    if (profile?.role === 'employee') {
      query = query.eq('user_id', profile.id)
    } else if (filterEmployee !== 'all') {
      query = query.eq('user_id', filterEmployee)
    }

    const { data } = await query
    if (data) setEvents(data as Event[])
  }

  async function fetchAllEventsForAvailability() {
    if (!profile?.org_id) return

    const start = startOfWeek(currentDate)
    const end = endOfWeek(currentDate)

    let query = supabase
      .from('events')
      .select('*, profiles(full_name)')
      .eq('org_id', profile.org_id)
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString())
      .order('start_time', { ascending: true })

    if (profile?.role === 'employee') {
      query = query.eq('user_id', profile.id)
    } else if (availabilityEmployee !== 'all') {
      query = query.eq('user_id', availabilityEmployee)
    } else if (filterEmployee !== 'all') {
      query = query.eq('user_id', filterEmployee)
    }

    const { data } = await query
    if (data) setEvents(data as Event[])
  }

  useEffect(() => {
    if (!profile) return
    fetchEvents()
    if (isManagerRole(profile.role)) {
      fetchOrgProfiles({ roles: ['employee', 'manager', 'platform_admin'] }).then((data) => {
        setEmployees(data.map((p) => ({ id: p.id, full_name: p.full_name, phone: p.phone })))
      })
    }
  }, [profile, filterEmployee, currentDate, view, fetchOrgProfiles])

  useEffect(() => {
    if (showAvailability) {
      fetchAllEventsForAvailability()
    }
  }, [showAvailability, availabilityEmployee, currentDate])

  function getWeekDays(date: Date, weekCount: number = 1): Date[] {
    const start = startOfWeek(date)
    return Array.from({ length: 7 * weekCount }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }

  function getEventsForDay(date: Date): Event[] {
    return events
      .filter(e => {
        const eventDate = new Date(e.start_time)
        return (
          eventDate.getFullYear() === date.getFullYear() &&
          eventDate.getMonth() === date.getMonth() &&
          eventDate.getDate() === date.getDate()
        )
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }

  function getMonthDays(date: Date): (Date | null)[] {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const blanks: null[] = Array(firstDay === 0 ? 6 : firstDay - 1).fill(null)
    const days: Date[] = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
    return [...blanks, ...days]
  }

  function navigate(dir: number) {
    const d = new Date(currentDate)
    if (view === 'day') d.setDate(d.getDate() + dir)
    else if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setCurrentDate(d)
  }

  function goToToday() {
    setCurrentDate(new Date())
  }

  function openNewEvent(date: Date, hour?: number) {
    const target = new Date(date)
    if (hour !== undefined) {
      target.setHours(hour, 0, 0, 0)
    } else {
      target.setHours(9, 0, 0, 0)
    }
    const iso = toLocalDateTimeInput(target)
    setDefaultDate(iso)
    setSelectedEvent(null)
    setShowModal(true)
  }

  function openEditEvent(event: Event) {
    setSelectedEvent(event)
    setDefaultDate('')
    setShowModal(true)
  }

  async function handleDeleteLeave(ev: Event) {
    const canDelete = isManagerRole(profile?.role) || ev.user_id === profile?.id
    if (!canDelete) return
    if (!window.confirm(`Remove this leave block: "${ev.title}"?`)) return
    await supabase.from('events').delete().eq('id', ev.id)
    fetchEvents()
  }

  function getAvailabilityColor(available: boolean): string {
    return available ? 'bg-emerald-100 border-emerald-300' : 'bg-red-100 border-red-300'
  }

  function getAvailabilityText(available: boolean): string {
    return available ? 'text-emerald-700' : 'text-red-700'
  }

  // Renders one 7-day week grid (header row + leave banner + event cells).
  // Called once for normal week view, twice (stacked) for the 2-week view.
  function renderWeekGrid(days: Date[], weekKey: number) {
    return (
      <div key={weekKey}>
        <div className="grid grid-cols-7 divide-x divide-gray-100 border-b border-gray-100">
          {days.map((day, i) => {
            const isToday = day.toDateString() === new Date().toDateString()
            return (
              <div
                key={i}
                className={`p-1 sm:p-2 text-center cursor-pointer hover:bg-gray-50 transition ${isToday ? 'bg-blue-50' : ''}`}
                onClick={() => { setCurrentDate(new Date(day)); setView('day') }}
              >
                <p className="text-[10px] sm:text-xs text-gray-400">{dayNames[i]}</p>
                <p className={`text-sm sm:text-base font-semibold ${isToday ? 'text-[#004B93]' : 'text-gray-700'}`}>
                  {day.getDate()}
                </p>
              </div>
            )
          })}
        </div>

        {days.some(day => getEventsForDay(day).some(isLeaveEvent)) && (
          <div className="grid grid-cols-7 divide-x divide-gray-100 border-b border-gray-100 bg-gray-50">
            {days.map((day, i) => {
              const leaveEvents = getEventsForDay(day).filter(isLeaveEvent)
              return (
                <div key={i} className="p-1 space-y-0.5 min-h-[1.5rem]">
                  {leaveEvents.map(ev => (
                    <div
                      key={ev.id}
                      onClick={() => handleDeleteLeave(ev)}
                      className="text-[9px] sm:text-[10px] bg-gray-900 text-white rounded px-1 py-0.5 truncate cursor-pointer hover:bg-gray-800 transition"
                      title={`${ev.title} — click to remove`}
                    >
                      🚫 {ev.title}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <div className="grid grid-cols-7 divide-x divide-gray-100">
          {days.map((day, i) => {
            const isToday = day.toDateString() === new Date().toDateString()
            const dayEvents = getTimedEventsForDay(day)
            return (
              <div key={i} className="min-h-32 sm:min-h-40">
                <div
                  className={`p-1 space-y-1 min-h-full ${isToday ? 'bg-blue-50/30' : ''}`}
                  onClick={() => openNewEvent(new Date(day))}
                >
                  {dayEvents.map(event => (
                    <div
                      key={event.id}
                      onClick={e => { e.stopPropagation(); openEditEvent(event) }}
                      className="text-[10px] sm:text-xs p-1 sm:p-1.5 rounded cursor-pointer text-white hover:opacity-90 transition shadow-sm"
                      style={{ backgroundColor: eventColor(event) }}
                      title={`${event.title}\n${formatDuration(event.start_time, event.end_time)}`}
                    >
                      <p className="font-medium truncate">{event.title}</p>
                      <p className="text-[9px] sm:text-[10px] opacity-90">
                        {formatTime(event.start_time)} – {formatTime(event.end_time)}
                      </p>
                      {event.client_name && (
                        <p className="text-[9px] sm:text-[10px] opacity-90 truncate">👤 {event.client_name}</p>
                      )}
                      {isTeamMeetingCategory(event.category) ? (
                        <p className="text-[9px] sm:text-[10px] opacity-75 truncate">
                          {teamMeetingAttendeeLabel(event)}
                        </p>
                      ) : isManagerRole(profile?.role) && event.profiles && (
                        <p className="text-[9px] sm:text-[10px] opacity-75 truncate">{event.profiles.full_name}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const twoWeekView = view === 'week' && isTabletUp
  const weekDays = getWeekDays(currentDate, twoWeekView ? 2 : 1)
  const weekChunks: Date[][] = twoWeekView ? [weekDays.slice(0, 7), weekDays.slice(7, 14)] : [weekDays]
  const availabilityWeekDays = weekDays.slice(0, 7) // Availability lookup always shows just the current week
  const monthDays = getMonthDays(currentDate)

  const headerLabel = (() => {
    if (view === 'day') {
      return currentDate.toLocaleDateString('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    }
    if (view === 'week') {
      const last = weekDays[weekDays.length - 1]
      return `${weekDays[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return currentDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  })()

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {showModal && (
        <EventModal
          existingEvent={selectedEvent ?? undefined}
          defaultDate={defaultDate}
          employees={employees}
          defaultAssigneeId={filterEmployee !== 'all' ? filterEmployee : profile?.id}
          onClose={() => setShowModal(false)}
          onSaved={fetchEvents}
        />
      )}

      {showBlackoutModal && (
        <BlackoutModal
          employees={employees}
          onClose={() => setShowBlackoutModal(false)}
          onSaved={fetchEvents}
        />
      )}

      {/* ── Toolbar ── */}
      <div className="p-3 sm:p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-600"
              aria-label="Previous"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="font-semibold text-gray-800 text-sm sm:text-base min-w-0 truncate max-w-[180px] sm:max-w-none">
              {headerLabel}
            </span>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-600"
              aria-label="Next"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <button
            onClick={goToToday}
            className="text-xs sm:text-sm border border-gray-300 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg hover:bg-gray-50 transition font-medium whitespace-nowrap"
          >
            Today
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          {isManagerRole(profile?.role) && (
            <select
              value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
              className="w-full sm:w-auto text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#004B93] bg-white"
            >
              <option value="all">All employees</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          )}

          {isManagerRole(profile?.role) && employees.length > 0 && filterEmployee === 'all' && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 w-full sm:w-auto">
              {employees.map((emp) => (
                <span key={emp.id} className="inline-flex items-center gap-1 text-[10px] sm:text-xs text-gray-600">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: employeeColorMap.get(emp.id) }}
                  />
                  {emp.full_name.split(' ')[0]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: TEAM_MEETING_COLOR }} />
                Team meeting
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 sm:ml-auto">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-1 sm:flex-none">
              {(['day', 'week', 'month'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-sm capitalize transition ${
                    view === v
                      ? 'bg-[#004B93] text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowAvailability(!showAvailability)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1 whitespace-nowrap flex-shrink-0 border ${
                showAvailability
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
              title="Toggle availability lookup view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">{showAvailability ? 'Hide' : 'Check'}</span>
            </button>

            <button
              onClick={() => setShowBlackoutModal(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1 whitespace-nowrap flex-shrink-0 border bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
              title="Block out a day as leave/unavailable"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" strokeWidth={2} />
                <path strokeLinecap="round" strokeWidth={2} d="M5.5 5.5l13 13" />
              </svg>
              <span className="hidden sm:inline">Leave</span>
            </button>

            <button
              onClick={() => {
                setSelectedEvent(null)
                setDefaultDate(toLocalDateTimeInput(new Date()))
                setShowModal(true)
              }}
              className="bg-[#004B93] text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#003d7a] transition flex items-center gap-1 whitespace-nowrap flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Event</span>
            </button>
          </div>
        </div>

        {/* ── Availability Lookup Panel ── */}
        {showAvailability && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Availability Lookup
              </h3>

              {isManagerRole(profile?.role) && (
                <select
                  value={availabilityEmployee}
                  onChange={e => setAvailabilityEmployee(e.target.value)}
                  className="w-full sm:w-auto text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#004B93] bg-white"
                >
                  <option value="all">All employees</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              )}

              <select
                value={availabilityDuration}
                onChange={e => setAvailabilityDuration(Number(e.target.value))}
                className="w-full sm:w-auto text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#004B93] bg-white"
              >
                <option value={30}>30 min job</option>
                <option value={60}>1 hour job</option>
                <option value={90}>1.5 hour job</option>
                <option value={120}>2 hour job</option>
                <option value={180}>3 hour job</option>
                <option value={240}>4 hour job</option>
                <option value={480}>Full day</option>
              </select>

              <div className="flex items-center gap-3 text-xs text-gray-500 ml-auto">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" />
                  Free
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" />
                  Busy
                </span>
              </div>
            </div>

            {view === 'day' && (
              <div className="grid grid-cols-1 gap-1">
                {getAvailabilityForDay(events, currentDate, availabilityDuration).map(({ hour, available }) => (
                  <div
                    key={hour}
                    className={`flex items-center gap-2 px-2 py-1 rounded border text-xs transition cursor-pointer hover:opacity-80 ${getAvailabilityColor(available)}`}
                    onClick={() => available && openNewEvent(new Date(currentDate), hour)}
                    title={available ? `Click to book at ${String(hour).padStart(2, '0')}:00` : 'Slot unavailable'}
                  >
                    <span className="font-mono font-medium w-12">{String(hour).padStart(2, '0')}:00</span>
                    <span className={`font-medium ${getAvailabilityText(available)}`}>
                      {available ? '✓ Available' : '✗ Busy'}
                    </span>
                    {available && (
                      <span className="ml-auto text-emerald-600 opacity-0 hover:opacity-100 transition text-[10px]">
                        Click to book →
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {view === 'week' && (
              <div className="grid grid-cols-7 gap-1">
                {availabilityWeekDays.map((day, i) => {
                  const dayEvents = getEventsForDay(day)
                  const availability = getAvailabilityForDay(dayEvents, day, availabilityDuration)
                  const isToday = day.toDateString() === new Date().toDateString()
                  const dayName = dayNames[i]
                  const dateNum = day.getDate()

                  return (
                    <div key={i} className={`border rounded-lg overflow-hidden ${isToday ? 'border-[#004B93]' : 'border-gray-200'}`}>
                      <div className={`text-center py-1 text-xs font-medium ${isToday ? 'bg-[#004B93] text-white' : 'bg-gray-100 text-gray-600'}`}>
                        <div>{dayName}</div>
                        <div>{dateNum}</div>
                      </div>
                      <div className="space-y-0.5 p-1">
                        {availability.map(({ hour, available }) => (
                          <div
                            key={hour}
                            className={`text-[9px] px-1 py-0.5 rounded border text-center cursor-pointer hover:opacity-80 transition ${getAvailabilityColor(available)}`}
                            onClick={() => available && openNewEvent(new Date(day), hour)}
                            title={available ? `${String(hour).padStart(2, '0')}:00 - Available` : `${String(hour).padStart(2, '0')}:00 - Busy`}
                          >
                            <span className={`font-medium ${getAvailabilityText(available)}`}>
                              {available ? '✓' : '✗'}
                            </span>
                            <span className="ml-0.5 text-gray-500">{String(hour).padStart(2, '0')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {view === 'month' && (
              <div className="grid grid-cols-7 gap-1">
                {dayNames.map(d => (
                  <div key={d} className="text-center text-[10px] font-medium text-gray-500 py-1">
                    {d}
                  </div>
                ))}
                {monthDays.map((day, i) => {
                  if (!day) return <div key={i} className="min-h-12 bg-gray-50 rounded" />
                  const dayEvents = getEventsForDay(day)
                  const availability = getAvailabilityForDay(dayEvents, day, availabilityDuration)
                  const availableCount = availability.filter(a => a.available).length
                  const totalSlots = availability.length
                  const isToday = day.toDateString() === new Date().toDateString()
                  const availabilityPercent = Math.round((availableCount / totalSlots) * 100)

                  return (
                    <div
                      key={i}
                      className={`min-h-12 p-1 rounded border cursor-pointer hover:opacity-80 transition ${
                        isToday ? 'border-[#004B93] bg-blue-50' : 'border-gray-200'
                      }`}
                      onClick={() => { setCurrentDate(new Date(day)); setView('day') }}
                    >
                      <div className={`text-[10px] font-semibold mb-0.5 ${isToday ? 'text-[#004B93]' : 'text-gray-600'}`}>
                        {day.getDate()}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${availabilityPercent}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-gray-500 font-medium">{availableCount}h</span>
                      </div>
                      <div className="mt-0.5 text-[9px] text-gray-400">
                        {availableCount > 0 ? `${availableCount} slots free` : 'Fully booked'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MOBILE RESOURCE VIEW ── */}
      {showResourceView && (
        <MobileResourceView
          events={events}
          employees={employees}
          employeeColorMap={employeeColorMap}
          selectedDate={currentDate}
          onEventClick={openEditEvent}
          onAddEvent={openNewEvent}
          onLeaveClick={handleDeleteLeave}
        />
      )}

      {!showResourceView && (
        <>
          {/* ── DAY VIEW ── */}
          {view === 'day' && (
            <div>
              {/* All-day leave banner */}
              {getEventsForDay(currentDate).filter(isLeaveEvent).length > 0 && (
                <div className="px-3 sm:px-4 py-2 bg-gray-900 border-b border-gray-100 space-y-1">
                  {getEventsForDay(currentDate).filter(isLeaveEvent).map(ev => (
                    <div
                      key={ev.id}
                      onClick={() => handleDeleteLeave(ev)}
                      className="flex items-center gap-2 text-white text-xs sm:text-sm rounded px-2 py-1 cursor-pointer hover:bg-gray-800 transition"
                      title="Click to remove this leave block"
                    >
                      <span>🚫</span>
                      <span className="font-medium">{ev.title}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex">
                <div className="w-14 sm:w-16 flex-shrink-0 border-r border-gray-100 bg-gray-50">
                  <div className="h-10 border-b border-gray-100" />
                  {HOUR_LABELS.map(hour => (
                    <div
                      key={hour}
                      className="text-[10px] sm:text-xs text-gray-400 text-right pr-1 sm:pr-2 pt-1"
                      style={{ height: SLOT_HEIGHT }}
                    >
                      {String(hour).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                <div className="flex-1 relative">
                  <div className="h-10 border-b border-gray-100 flex items-center justify-center bg-white sticky top-0 z-10">
                    <span className="text-sm font-semibold text-gray-700">
                      {fullDayNames[currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1]}
                    </span>
                  </div>

                  <div className="relative">
                    {HOUR_LABELS.map(hour => (
                      <div
                        key={hour}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition cursor-pointer"
                        style={{ height: SLOT_HEIGHT }}
                        onClick={() => openNewEvent(new Date(currentDate), hour)}
                      />
                    ))}

                    {(() => {
                      const now = new Date()
                      const isToday = currentDate.toDateString() === now.toDateString()
                      if (!isToday) return null
                      const minutes = now.getHours() * 60 + now.getMinutes()
                      const dayMinutes = DAY_START_HOUR * 60
                      const totalDayMinutes = (DAY_END_HOUR - DAY_START_HOUR + 1) * 60
                      const elapsed = minutes - dayMinutes
                      if (elapsed < 0 || elapsed > totalDayMinutes) return null
                      const top = (elapsed / 60) * SLOT_HEIGHT
                      return (
                        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
                          <div className="flex items-center">
                            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                            <div className="flex-1 h-px bg-red-500" />
                          </div>
                        </div>
                      )
                    })()}

                    {getTimedEventsForDay(currentDate).map(event => {
                      const top = getEventTop(event.start_time)
                      const height = getEventHeight(event.start_time, event.end_time)
                      const isBooking = event.category === 'Booking' || event.category === 'Assigned Leads'

                      return (
                        <div
                          key={event.id}
                          className="absolute left-1 right-1 rounded-lg cursor-pointer hover:brightness-95 transition overflow-hidden shadow-sm"
                          style={{ top, height, backgroundColor: eventColor(event), minHeight: 28 }}
                          onClick={e => { e.stopPropagation(); openEditEvent(event) }}
                        >
                          <div className="p-1 sm:p-1.5 text-white h-full flex flex-col">
                            <p className="text-[10px] sm:text-xs font-semibold truncate leading-tight">{event.title}</p>
                            <p className="text-[9px] sm:text-[10px] opacity-90 leading-tight mt-0.5">
                              {formatTime(event.start_time)} – {formatTime(event.end_time)}
                            </p>
                            {isBooking && height > 50 && (
                              <div className="mt-1 space-y-0.5">
                                {event.client_name && (
                                  <p className="text-[9px] sm:text-[10px] opacity-90 truncate">👤 {event.client_name}</p>
                                )}
                                {event.client_phone && height > 70 && (
                                  <p className="text-[9px] sm:text-[10px] opacity-90 truncate">📞 {event.client_phone}</p>
                                )}
                                {event.client_address && height > 90 && (
                                  <p className="text-[9px] sm:text-[10px] opacity-90 truncate">📍 {event.client_address}</p>
                                )}
                                {event.client_job && height > 110 && (
                                  <p className="text-[9px] sm:text-[10px] opacity-80 truncate">📝 {event.client_job}</p>
                                )}
                                {event.job_quote && height > 110 && (
                                  <p className="text-[9px] sm:text-[10px] opacity-80 truncate">💲 Quote: ${event.job_quote}</p>
                                )}
                              </div>
                            )}
                            {isTeamMeetingCategory(event.category) ? (
                              <p className="text-[9px] sm:text-[10px] opacity-75 mt-auto pt-1 truncate">
                                {teamMeetingAttendeeLabel(event)}
                              </p>
                            ) : isManagerRole(profile?.role) && event.profiles && height > 50 && (
                              <p className="text-[9px] sm:text-[10px] opacity-75 mt-auto pt-1 truncate">
                                {event.profiles.full_name}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── WEEK VIEW ── */}
          {view === 'week' && (
            <div className={twoWeekView ? 'divide-y-2 divide-gray-200' : ''}>
              {weekChunks.map((chunk, idx) => renderWeekGrid(chunk, idx))}
            </div>
          )}

          {/* ── MONTH VIEW ── */}
          {view === 'month' && (
            <div>
              <div className="grid grid-cols-7 border-b border-gray-100">
                {dayNames.map(d => (
                  <div key={d} className="p-1 sm:p-2 text-center text-[10px] sm:text-xs font-medium text-gray-400">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
                {monthDays.map((day, i) => {
                  if (!day) return <div key={i} className="min-h-16 sm:min-h-24 bg-gray-50" />
                  const isToday = day.toDateString() === new Date().toDateString()
                  const dayEvents = [
                    ...getEventsForDay(day).filter(isLeaveEvent),
                    ...getTimedEventsForDay(day),
                  ]
                  return (
                    <div
                      key={i}
                      className={`min-h-16 sm:min-h-24 p-0.5 sm:p-1 cursor-pointer hover:bg-gray-50 transition ${isToday ? 'bg-blue-50' : ''}`}
                      onClick={() => { setCurrentDate(new Date(day)); setView('day') }}
                    >
                      <p className={`text-[10px] sm:text-xs font-semibold mb-0.5 sm:mb-1 ${isToday ? 'text-[#004B93]' : 'text-gray-600'}`}>
                        {day.getDate()}
                      </p>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map(event => (
                          <div
                            key={event.id}
                            onClick={e => {
                              e.stopPropagation()
                              isLeaveEvent(event) ? handleDeleteLeave(event) : openEditEvent(event)
                            }}
                            className="text-[9px] sm:text-xs p-0.5 px-1 rounded cursor-pointer text-white truncate hover:opacity-80 transition shadow-sm"
                            style={{ backgroundColor: eventColor(event) }}
                            title={`${event.title}\n${formatDuration(event.start_time, event.end_time)}`}
                          >
                            {isLeaveEvent(event) ? (
                              <span className="font-medium">🚫 {event.title}</span>
                            ) : (
                              <>
                                <span className="font-medium">{formatTime(event.start_time)}</span>{' '}
                                <span>{event.title}</span>
                              </>
                            )}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <p className="text-[9px] sm:text-xs text-gray-400 font-medium">
                            +{dayEvents.length - 3} more
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}