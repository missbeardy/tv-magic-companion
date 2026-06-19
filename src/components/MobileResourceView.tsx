// src/components/MobileResourceView.tsx

interface CalEvent {
  id: string
  title: string
  start_time: string
  end_time: string
  user_id: string
  color: string
  category?: string
  client_name?: string
  client_phone?: string
}

interface Profile {
  id: string
  full_name: string
}

interface MobileResourceViewProps {
  events: CalEvent[]
  employees: Profile[]
  selectedDate: Date
  onEventClick: (event: CalEvent) => void
  onAddEvent: (date: Date, hour: number) => void
  onLeaveClick?: (event: CalEvent) => void
}

const DAY_START_HOUR = 6   // matches your Calendar.tsx constant
const DAY_END_HOUR = 20    // matches your Calendar.tsx constant
const SLOT_HEIGHT = 64     // matches your Calendar.tsx constant
const LEAVE_ROW_HEIGHT = 20 // px per leave entry in the banner strip
const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i
)

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? 'pm' : 'am'
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${display}${suffix}`
}

function getEventTop(isoTime: string): number {
  const d = new Date(isoTime)
  const hours = d.getHours() + d.getMinutes() / 60
  return Math.max(0, (hours - DAY_START_HOUR) * SLOT_HEIGHT)
}

function getEventHeight(start: string, end: string): number {
  const diffMs = new Date(end).getTime() - new Date(start).getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  return Math.max(28, diffHours * SLOT_HEIGHT)
}

function isSameDay(isoTime: string, date: Date): boolean {
  const d = new Date(isoTime)
  return (
    d.getFullYear() === date.getFullYear() &&
    d.getMonth() === date.getMonth() &&
    d.getDate() === date.getDate()
  )
}

function isLeaveEvent(e: CalEvent): boolean {
  return e.category === 'Leave'
}

// Leave blocks can span multiple days, so unlike timed appointments we check
// whether `date` falls anywhere inside [start_time, end_time], not just
// whether start_time happens to be on that day.
function leaveActiveOnDay(event: CalEvent, date: Date): boolean {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)
  const evStart = new Date(event.start_time)
  const evEnd = new Date(event.end_time)
  return evStart <= dayEnd && evEnd >= dayStart
}

export function MobileResourceView({
  events,
  employees,
  selectedDate,
  onEventClick,
  onAddEvent,
  onLeaveClick,
}: MobileResourceViewProps) {
  const timedDayEvents = events.filter(e => !isLeaveEvent(e) && isSameDay(e.start_time, selectedDate))
  const leaveEventsForDay = events.filter(e => isLeaveEvent(e) && leaveActiveOnDay(e, selectedDate))
  const totalHeight = HOURS.length * SLOT_HEIGHT

  // Reserve enough banner height for whichever technician has the most leave
  // entries today, so every column (and the time gutter) stays aligned.
  const maxLeaveRows = employees.reduce((max, emp) => {
    const count = leaveEventsForDay.filter(e => e.user_id === emp.id).length
    return Math.max(max, count)
  }, 0)
  const leaveBannerHeight = maxLeaveRows > 0 ? maxLeaveRows * LEAVE_ROW_HEIGHT + 6 : 0

  return (
    <div className="flex flex-col" style={{ maxHeight: '70vh' }}>
      {/* Date header */}
      <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 flex-shrink-0">
        <p className="text-sm font-semibold text-[#004B93]">
          {selectedDate.toLocaleDateString('en-AU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">← Swipe to see all technicians →</p>
      </div>

      {/* Scrollable grid */}
      <div className="flex overflow-auto flex-1">

        {/* Time gutter */}
        <div className="flex-none w-12 bg-gray-50 border-r border-gray-100 flex-shrink-0">
          {/* header spacer */}
          <div className="h-10 border-b border-gray-100" />
          {/* leave banner spacer — keeps gutter aligned with tech columns */}
          {leaveBannerHeight > 0 && (
            <div className="border-b border-gray-100" style={{ height: leaveBannerHeight }} />
          )}
          <div className="relative" style={{ height: totalHeight }}>
            {HOURS.map(hour => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex justify-center items-start"
                style={{ top: (hour - DAY_START_HOUR) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
              >
                <span className="text-[10px] text-gray-400 mt-1">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tech columns — horizontal scroll */}
        <div className="flex overflow-x-auto">
          {employees.map(emp => {
            const techEvents = timedDayEvents.filter(e => e.user_id === emp.id)
            const techLeave = leaveEventsForDay.filter(e => e.user_id === emp.id)

            return (
              <div key={emp.id} className="flex-none w-36 border-r border-gray-100">
                {/* Tech name header */}
                <div className="h-10 flex items-center justify-center border-b border-gray-100 bg-white px-1 sticky top-0 z-10">
                  <span className="text-xs font-semibold text-[#004B93] text-center truncate">
                    {emp.full_name}
                  </span>
                </div>

                {/* Leave/blackout banner */}
                {leaveBannerHeight > 0 && (
                  <div
                    className="bg-gray-900 border-b border-gray-100 px-1 py-0.5 space-y-0.5 overflow-hidden"
                    style={{ height: leaveBannerHeight }}
                  >
                    {techLeave.map(ev => (
                      <div
                        key={ev.id}
                        onClick={() => (onLeaveClick ?? onEventClick)(ev)}
                        className="text-[9px] text-white rounded px-1 py-0.5 truncate cursor-pointer hover:bg-gray-800 transition"
                        title={`${ev.title} — tap to remove`}
                      >
                        🚫 {ev.title}
                      </div>
                    ))}
                  </div>
                )}

                {/* Event area */}
                <div
                  className="relative bg-white"
                  style={{ height: totalHeight }}
                >
                  {/* Hour grid lines */}
                  {HOURS.map(hour => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-gray-50 hover:bg-gray-50/50 cursor-pointer transition"
                      style={{ top: (hour - DAY_START_HOUR) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                      onClick={() => onAddEvent(selectedDate, hour)}
                    />
                  ))}

                  {/* Events */}
                  {techEvents.map(event => {
                    const top = getEventTop(event.start_time)
                    const height = getEventHeight(event.start_time, event.end_time)
                    const startTime = new Date(event.start_time).toLocaleTimeString('en-AU', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })

                    return (
                      <button
                        key={event.id}
                        onClick={e => { e.stopPropagation(); onEventClick(event) }}
                        className="absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 text-left overflow-hidden shadow-sm hover:brightness-95 transition"
                        style={{ top, height, backgroundColor: event.color, minHeight: 28 }}
                      >
                        <p className="text-[10px] font-semibold text-white truncate leading-tight">
                          {event.title}
                        </p>
                        <p className="text-[9px] text-white/80 leading-tight">
                          {startTime}
                        </p>
                        {event.client_name && height > 50 && (
                          <p className="text-[9px] text-white/80 truncate leading-tight">
                            👤 {event.client_name}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {employees.length === 0 && (
            <div className="flex items-center justify-center text-sm text-gray-400 p-8 w-48">
              No employees found.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}