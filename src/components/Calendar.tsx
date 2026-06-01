import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import EventModal from './EventModal'

interface Event {
  id: string
  title: string
  description: string
  start_time: string
  end_time: string
  user_id: string
  color: string
  profiles?: { full_name: string }
}

interface Profile {
  id: string
  full_name: string
}

type ViewMode = 'week' | 'month'

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

  // --- Week view helpers ---
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
    return events.filter(e => {
      const eventDate = new Date(e.start_time)
      return (
        eventDate.getFullYear() === date.getFullYear() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getDate() === date.getDate()
      )
    })
  }

  // --- Month view helpers ---
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
    if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setCurrentDate(d)
  }

  function openNewEvent(date: Date) {
    const iso = new Date(date.setHours(9, 0, 0, 0)).toISOString().slice(0, 16)
    setDefaultDate(iso)
    setSelectedEvent(null)
    setShowModal(true)
  }

  const weekDays = getWeekDays(currentDate)
  const monthDays = getMonthDays(currentDate)
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const headerLabel = view === 'week'
    ? `${weekDays[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : currentDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {showModal && (
        <EventModal
          event={selectedEvent}
          defaultDate={defaultDate}
          onClose={() => setShowModal(false)}
          onSaved={fetchEvents}
        />
      )}

      {/* Calendar Header */}
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-1 rounded hover:bg-gray-100 transition text-gray-600"
          >
            ◀
          </button>
          <span className="font-semibold text-gray-800 text-sm min-w-48 text-center">
            {headerLabel}
          </span>
          <button
            onClick={() => navigate(1)}
            className="p-1 rounded hover:bg-gray-100 transition text-gray-600"
          >
            ▶
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="text-xs border border-gray-300 px-2 py-1 rounded-lg hover:bg-gray-50 transition ml-1"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          {profile?.role === 'manager' && (
            <select
              value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            >
              <option value="all">All employees</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          )}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1 text-sm transition ${view === 'week' ? 'bg-[#004B93] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Week
            </button>
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1 text-sm transition ${view === 'month' ? 'bg-[#004B93] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Month
            </button>
          </div>
          <button
            onClick={() => { setSelectedEvent(null); setDefaultDate(new Date().toISOString().slice(0, 16)); setShowModal(true) }}
            className="bg-[#004B93] text-white px-3 py-1 rounded-lg text-sm hover:bg-[#003d7a] transition"
          >
            + Event
          </button>
        </div>
      </div>

      {/* Week View */}
      {view === 'week' && (
        <div className="grid grid-cols-7 divide-x divide-gray-100">
          {weekDays.map((day, i) => {
            const isToday = day.toDateString() === new Date().toDateString()
            const dayEvents = getEventsForDay(day)
            return (
              <div key={i} className="min-h-32">
                <div
                  className={`p-2 text-center border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${isToday ? 'bg-blue-50' : ''}`}
                  onClick={() => openNewEvent(new Date(day))}
                >
                  <p className="text-xs text-gray-400">{dayNames[i]}</p>
                  <p className={`text-sm font-semibold ${isToday ? 'text-[#004B93]' : 'text-gray-700'}`}>
                    {day.getDate()}
                  </p>
                </div>
                <div className="p-1 space-y-1">
                  {dayEvents.map(event => (
                    <div
                      key={event.id}
                      onClick={() => { setSelectedEvent(event); setShowModal(true) }}
                      className="text-xs p-1 rounded cursor-pointer text-white truncate hover:opacity-80 transition"
                      style={{ backgroundColor: event.color }}
                      title={event.title}
                    >
                      {event.title}
                      {profile?.role === 'manager' && event.profiles && (
                        <span className="block opacity-75 text-xs">{event.profiles.full_name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Month View */}
      {view === 'month' && (
        <div>
          <div className="grid grid-cols-7 border-b border-gray-100">
            {dayNames.map(d => (
              <div key={d} className="p-2 text-center text-xs font-medium text-gray-400">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
            {monthDays.map((day, i) => {
              if (!day) return <div key={i} className="min-h-20 bg-gray-50" />
              const isToday = day.toDateString() === new Date().toDateString()
              const dayEvents = getEventsForDay(day)
              return (
                <div
                  key={i}
                  className={`min-h-20 p-1 cursor-pointer hover:bg-gray-50 transition ${isToday ? 'bg-blue-50' : ''}`}
                  onClick={() => openNewEvent(new Date(day))}
                >
                  <p className={`text-xs font-semibold mb-1 ${isToday ? 'text-[#004B93]' : 'text-gray-600'}`}>
                    {day.getDate()}
                  </p>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map(event => (
                      <div
                        key={event.id}
                        onClick={e => { e.stopPropagation(); setSelectedEvent(event); setShowModal(true) }}
                        className="text-xs p-0.5 px-1 rounded cursor-pointer text-white truncate hover:opacity-80 transition"
                        style={{ backgroundColor: event.color }}
                        title={event.title}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-xs text-gray-400">+{dayEvents.length - 3} more</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}