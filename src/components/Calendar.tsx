// src/components/Calendar.tsx

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import EventModal from './EventModal'
import { MobileResourceView } from './MobileResourceView'

// ── Types ───────────────────────────────────────────────────────────────────

interface Event {
  id: string
  title: string
  description: string
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
  lead_id?: string
  profiles?: { full_name: string }
}

interface Profile {
  id: string
  full_name: string
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
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDuration(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

function getEventTop(startTime: string): number {
  const d = new Date(startTime)
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

// ── Component ───────────────────────────────────────────────────────────────

export default function Calendar() {
  const { profile } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [view, setView] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [defaultDate, setDefaultDate] = useState('')
  const [employees, setEmployees] = useState<Profile[]>([])
  const [filterEmployee, setFilterEmployee] = useState<string>('all')

  // ── Mobile resource view detection ──
  // true when screen is narrower than 768px (md breakpoint)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const showResourceView = isMobile && profile?.role === 'manager' && filterEmployee === 'all' && view !== 'month'

  // ── Data Fetching ──

  async function fetchEvents() {
    let query = supabase
      .from('events')
      .select('*, profiles(full_name)')
      .order('start_time', { ascending: true })

    if (profile?.role === 'employee') {
      query = query.eq('user_id', profile.id)
    } else if (filterEmployee !== 'all') {
      query = query.eq('user_id', filterEmployee)
    }

    const { data } = await query
    if (data) setEvents(data as Event[])
  }

  useEffect(() => {
    if (!profile) return
    fetchEvents()
    if (profile.role === 'manager') {
      supabase
        .from('profiles')
        .select('id, full_name')
        .then(({ data }) => { if (data) setEmployees(data) })
    }
  }, [profile, filterEmployee])

  // ── Date Helpers ──

  function getWeekDays(date: Date): Date[] {
    const start = new Date(date)
    start.setDate(date.getDate() - date.getDay() + 1)
    return Array.from({ length: 7 }, (_, i) => {
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

  // ── Navigation ──

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

  // ── Event Modal ──

  function openNewEvent(date: Date, hour?: number) {
    const target = new Date(date)
    if (hour !== undefined) {
      target.setHours(hour, 0, 0, 0)
    } else {
      target.setHours(9, 0, 0, 0)
    }
    const iso = target.toISOString().slice(0, 16)
    setDefaultDate(iso)
    setSelectedEvent(null)
    setShowModal(true)
  }

  function openEditEvent(event: Event) {
    setSelectedEvent(event)
    setDefaultDate('')
    setShowModal(true)
  }

  // ── Header Label ──

  const weekDays = getWeekDays(currentDate)
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
      return `${weekDays[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return currentDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  })()

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Event Modal */}
      {showModal && (
        <EventModal
          event={selectedEvent}
          defaultDate={defaultDate}
          onClose={() => setShowModal(false)}
          onSaved={fetchEvents}
        />
      )}

      {/* ── Toolbar ── */}
      <div className="p-3 sm:p-4 border-b border-gray-100">
        {/* Row 1: Navigation + Date + Today */}
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

        {/* Row 2: Employee Filter + View Toggle + Add */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          {profile?.role === 'manager' && (
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
              onClick={() => {
                setSelectedEvent(null)
                setDefaultDate(new Date().toISOString().slice(0, 16))
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
      </div>

      {/* ── MOBILE RESOURCE VIEW ── manager + all employees + week/day on mobile */}
      {showResourceView && (
        <MobileResourceView
          events={events}
          employees={employees}
          selectedDate={currentDate}
          onEventClick={openEditEvent}
          onAddEvent={openNewEvent}
        />
      )}

      {/* ── Standard views — hidden on mobile when resource view is showing ── */}
      {!showResourceView && (
        <>
          {/* ── DAY VIEW ── */}
          {view === 'day' && (
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

                  {getEventsForDay(currentDate).map(event => {
                    const top = getEventTop(event.start_time)
                    const height = getEventHeight(event.start_time, event.end_time)
                    const isBooking = event.category === 'Booking' || event.category === 'Assigned Leads'

                    return (
                      <div
                        key={event.id}
                        className="absolute left-1 right-1 rounded-lg cursor-pointer hover:brightness-95 transition overflow-hidden shadow-sm"
                        style={{ top, height, backgroundColor: event.color, minHeight: 28 }}
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
                            </div>
                          )}
                          {profile?.role === 'manager' && event.profiles && height > 50 && (
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
          )}

          {/* ── WEEK VIEW ── */}
          {view === 'week' && (
            <div>
              <div className="grid grid-cols-7 divide-x divide-gray-100 border-b border-gray-100">
                {weekDays.map((day, i) => {
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

              <div className="grid grid-cols-7 divide-x divide-gray-100">
                {weekDays.map((day, i) => {
                  const isToday = day.toDateString() === new Date().toDateString()
                  const dayEvents = getEventsForDay(day)
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
                            style={{ backgroundColor: event.color }}
                            title={`${event.title}\n${formatDuration(event.start_time, event.end_time)}`}
                          >
                            <p className="font-medium truncate">{event.title}</p>
                            <p className="text-[9px] sm:text-[10px] opacity-90">
                              {formatTime(event.start_time)} – {formatTime(event.end_time)}
                            </p>
                            {event.client_name && (
                              <p className="text-[9px] sm:text-[10px] opacity-90 truncate">👤 {event.client_name}</p>
                            )}
                            {profile?.role === 'manager' && event.profiles && (
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
                  const dayEvents = getEventsForDay(day)
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
                            onClick={e => { e.stopPropagation(); openEditEvent(event) }}
                            className="text-[9px] sm:text-xs p-0.5 px-1 rounded cursor-pointer text-white truncate hover:opacity-80 transition shadow-sm"
                            style={{ backgroundColor: event.color }}
                            title={`${event.title}\n${formatDuration(event.start_time, event.end_time)}`}
                          >
                            <span className="font-medium">{formatTime(event.start_time)}</span>{' '}
                            <span>{event.title}</span>
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