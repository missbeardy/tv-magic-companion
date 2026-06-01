interface Props {
  value: string // HH:MM format
  onChange: (value: string) => void
}

export default function TimePicker({ value, onChange }: Props) {
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

  const [selectedHour, selectedMinute] = value ? value.split(':') : ['09', '00']

  return (
    <div className="flex gap-2">
      <select
        value={selectedHour}
        onChange={e => onChange(`${e.target.value}:${selectedMinute}`)}
        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
      >
        {hours.map(h => (
          <option key={h} value={h}>
            {h}:00
          </option>
        ))}
      </select>
      <select
        value={selectedMinute}
        onChange={e => onChange(`${selectedHour}:${e.target.value}`)}
        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
      >
        {minutes.map(m => (
          <option key={m} value={m}>
            :{m}
          </option>
        ))}
      </select>
    </div>
  )
}