import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  title: string
  defaultOpen?: boolean
  badge?: ReactNode
  children: ReactNode
}

/** Expand/collapse card used across Franchise Settings. */
export default function SettingsAccordion({
  title,
  defaultOpen = false,
  badge,
  children,
}: Props) {
  const [expanded, setExpanded] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown size={18} className="shrink-0 text-gray-400" />
          ) : (
            <ChevronRight size={18} className="shrink-0 text-gray-400" />
          )}
          <span className="text-sm font-semibold text-gray-700 truncate">{title}</span>
          {badge}
        </div>
      </button>
      {expanded && (
        <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">{children}</div>
      )}
    </div>
  )
}
