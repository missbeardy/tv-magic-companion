// src/components/TimePicker.tsx

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '15', '30', '45']

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 768
}

export default function TimePicker({ value, onChange }: TimePickerProps) {
  const [hour, minute] = value.split(':')

  // Mobile: native time input — brings up the OS's built-in time picker UI
  if (isMobileViewport()) {
    return (
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
      />
    )
  }

  // Desktop: keep the two-dropdown picker
  return (
    <div className="flex gap-1">
      <select
        value={hour}
        onChange={e => onChange(`${e.target.value}:${minute}`)}
        className="flex-1 px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
      >
        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <select
        value={minute}
        onChange={e => onChange(`${hour}:${e.target.value}`)}
        className="flex-1 px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
      >
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  )
}