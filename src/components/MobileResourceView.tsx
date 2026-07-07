// src/components/MobileResourceView.tsx

import type { ThemeTokens } from '../lib/theme'
import { getEventCardStyles } from '../lib/calendarColors'
import { assignOverlapLayout } from '../lib/calendarLayout'
import CalendarEventCard from './CalendarEventCard'

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
  client_address?: string
}

interface Profile {
  id: string
  full_name: string
}

interface MobileResourceViewProps {
  events: CalEvent[]
  employees: Profile[]
  employeeColorMap: Map<string, string>
  theme: Pick<ThemeTokens, 'primary' | 'secondary' | 'primaryDark'>
  selectedDate: Date
  nowTick: number
  onEventClick: (event: CalEvent) => void
  onAddEvent: (date: Date, hour: number) => void
  onLeaveClick?: (event: CalEvent) => void
}

const DAY_START_HOUR = 6
const DAY_END_HOUR = 20
const SLOT_HEIGHT = 64
const LEAVE_ROW_HEIGHT = 20
const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i,
)

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? 'pm' : 'am'
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${display}${suffix}`
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
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
  employeeColorMap,
  theme,
  selectedDate,
  nowTick,
  onEventClick,
  onAddEvent,
  onLeaveClick,
}: MobileResourceViewProps) {
  const timedDayEvents = events.filter(e => !isLeaveEvent(e) && isSameDay(e.start_time, selectedDate))
  const leaveEventsForDay = events.filter(e => isLeaveEvent(e) && leaveActiveOnDay(e, selectedDate))
  const totalHeight = HOURS.length * SLOT_HEIGHT
  const isToday = selectedDate.toDateString() === new Date(nowTick).toDateString()

  const maxLeaveRows = employees.reduce((max, emp) => {
    const count = leaveEventsForDay.filter(e => e.user_id === emp.id).length
    return Math.max(max, count)
  }, 0)
  const leaveBannerHeight = maxLeaveRows > 0 ? maxLeaveRows * LEAVE_ROW_HEIGHT + 6 : 0

  return (
    <div className="flex flex-col" style={{ maxHeight: '70vh' }}>
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          {isToday && (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand text-white text-sm font-semibold shrink-0">
              {selectedDate.getDate()}
            </span>
          )}
          <p className="text-sm font-semibold text-brand">
            {selectedDate.toLocaleDateString('en-AU', {
              weekday: 'long',
              day: isToday ? undefined : 'numeric',
              month: 'long',
            })}
          </p>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">← Swipe to see all technicians →</p>
      </div>

      <div className="flex overflow-auto flex-1">
        <div className="flex-none w-12 bg-gray-50 border-r border-gray-100 flex-shrink-0">
          <div className="h-10 border-b border-gray-100" />
          {leaveBannerHeight > 0 && (
            <div className="border-b border-gray-100" style={{ height: leaveBannerHeight }} />
          )}
          <div className="relative" style={{ height: totalHeight }}>
            {HOURS.map(hour => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex justify-center items-start border-b border-gray-100"
                style={{ top: (hour - DAY_START_HOUR) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
              >
                <span className="text-[10px] text-gray-400 mt-1">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex overflow-x-auto">
          {employees.map(emp => {
            const techEvents = timedDayEvents.filter(e => e.user_id === emp.id)
            const techLeave = leaveEventsForDay.filter(e => e.user_id === emp.id)
            const accent = employeeColorMap.get(emp.id) ?? theme.primary
            const headerFill = getEventCardStyles(
              { user_id: emp.id, category: 'Booking' },
              employeeColorMap,
              theme,
            ).fill
            const overlapLayout = assignOverlapLayout(techEvents)

            return (
              <div key={emp.id} className="flex-none w-36 border-r border-gray-100">
                <div
                  className="h-10 flex items-center justify-center border-b border-gray-100 px-1 sticky top-0 z-10"
                  style={{ backgroundColor: headerFill }}
                >
                  <span
                    className="text-xs font-semibold text-center truncate"
                    style={{ color: accent }}
                  >
                    {emp.full_name}
                  </span>
                </div>

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

                <div className="relative bg-white" style={{ height: totalHeight }}>
                  {HOURS.map(hour => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer transition"
                      style={{ top: (hour - DAY_START_HOUR) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                      onClick={() => onAddEvent(selectedDate, hour)}
                    />
                  ))}

                  {HOURS.slice(0, -1).map(hour => (
                    <div
                      key={`half-${hour}`}
                      className="absolute left-0 right-0 border-t border-dotted border-gray-200/80 pointer-events-none"
                      style={{ top: (hour - DAY_START_HOUR) * SLOT_HEIGHT + SLOT_HEIGHT / 2 }}
                    />
                  ))}

                  {isToday && (() => {
                    const now = new Date(nowTick)
                    const minutes = now.getHours() * 60 + now.getMinutes()
                    const dayMinutes = DAY_START_HOUR * 60
                    const totalDayMinutes = (DAY_END_HOUR - DAY_START_HOUR + 1) * 60
                    const elapsed = minutes - dayMinutes
                    if (elapsed < 0 || elapsed > totalDayMinutes) return null
                    const top = (elapsed / 60) * SLOT_HEIGHT
                    return (
                      <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
                        <div className="flex items-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          <div className="flex-1 h-px bg-red-500" />
                        </div>
                      </div>
                    )
                  })()}

                  {techEvents.map(event => {
                    const top = getEventTop(event.start_time)
                    const height = getEventHeight(event.start_time, event.end_time)
                    const layout = overlapLayout.get(event.id) ?? { column: 0, totalColumns: 1 }
                    const widthPct = 100 / layout.totalColumns
                    const leftPct = layout.column * widthPct

                    return (
                      <div
                        key={event.id}
                        className="absolute z-10"
                        style={{
                          top,
                          height,
                          left: `calc(${leftPct}% + 1px)`,
                          width: `calc(${widthPct}% - 2px)`,
                          minHeight: 28,
                        }}
                      >
                        <CalendarEventCard
                          event={event}
                          styles={getEventCardStyles(event, employeeColorMap, theme)}
                          onClick={e => { e.stopPropagation(); onEventClick(event) }}
                          compact
                          showTime
                          showAddress={false}
                          formatTime={formatTime}
                          className="h-full"
                        />
                      </div>
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
