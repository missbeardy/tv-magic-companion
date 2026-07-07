import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import type { EventCardStyles } from '../lib/calendarColors'

export interface CalendarEventCardEvent {
  title: string
  client_name?: string | null
  client_address?: string | null
  start_time?: string
  end_time?: string
}

interface CalendarEventCardProps {
  event: CalendarEventCardEvent
  styles: EventCardStyles
  onClick?: (e: MouseEvent) => void
  className?: string
  style?: CSSProperties
  showTime?: boolean
  showAddress?: boolean
  formatTime?: (dateStr: string) => string
  formatDuration?: (start: string, end: string) => string
  footer?: ReactNode
  compact?: boolean
  title?: string
}

export default function CalendarEventCard({
  event,
  styles,
  onClick,
  className = '',
  style,
  showTime = false,
  showAddress = true,
  formatTime,
  formatDuration,
  footer,
  compact = false,
  title,
}: CalendarEventCardProps) {
  const padding = compact ? 'p-1' : 'p-1 sm:p-1.5'
  const titleSize = compact ? 'text-[10px]' : 'text-[10px] sm:text-xs'
  const metaSize = compact ? 'text-[9px]' : 'text-[9px] sm:text-[10px]'

  return (
    <div
      onClick={onClick}
      className={`rounded-lg cursor-pointer hover:brightness-[0.98] transition overflow-hidden shadow-sm flex flex-col ${padding} ${className}`}
      style={{
        backgroundColor: styles.fill,
        borderLeft: `3px solid ${styles.accent}`,
        color: styles.text,
        ...style,
      }}
    >
      <p className={`${titleSize} font-semibold truncate leading-tight`}>
        {title ?? event.title}
      </p>
      {showTime && event.start_time && event.end_time && formatDuration && (
        <p className={`${metaSize} opacity-80 leading-tight mt-0.5`}>
          {formatDuration(event.start_time, event.end_time)}
        </p>
      )}
      {showTime && event.start_time && !event.end_time && formatTime && (
        <p className={`${metaSize} opacity-80 leading-tight mt-0.5`}>
          {formatTime(event.start_time)}
        </p>
      )}
      {event.client_name && (
        <p className={`${metaSize} font-normal truncate leading-tight mt-0.5`}>
          {event.client_name}
        </p>
      )}
      {showAddress && event.client_address && (
        <p className={`${metaSize} opacity-70 truncate leading-tight mt-0.5 hidden sm:block`}>
          {event.client_address}
        </p>
      )}
      {footer}
    </div>
  )
}
