// src/components/LeadFilterBar.tsx
import { Search, X } from 'lucide-react'

interface Props {
  search: string
  onSearch: (v: string) => void
  statusFilter: string
  onStatusFilter: (v: string) => void
  serviceFilter: string
  onServiceFilter: (v: string) => void
  serviceTypes: string[]
}

const STATUSES = [
  { value: '',                  label: 'All' },
  { value: 'unassigned',        label: 'Unassigned' },
  { value: 'assigned',          label: 'Assigned' },
  { value: 'contact_attempted', label: 'Attempted' },
  { value: 'completed',         label: 'Completed' },
]

export default function LeadFilterBar({
  search, onSearch,
  statusFilter, onStatusFilter,
  serviceFilter, onServiceFilter,
  serviceTypes,
}: Props) {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search by name, phone, address…"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Status filters */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
        {STATUSES.map(s => (
          <button
            key={s.value}
            onClick={() => onStatusFilter(s.value)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === s.value
                ? 'bg-[#004B93] text-white'
                : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Service type filter */}
      {serviceTypes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          <button
            onClick={() => onServiceFilter('')}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              serviceFilter === ''
                ? 'bg-[#00B4C5] text-white'
                : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            All Services
          </button>
          {serviceTypes.map(s => (
            <button
              key={s}
              onClick={() => onServiceFilter(s)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                serviceFilter === s
                  ? 'bg-[#00B4C5] text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}