import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'

interface PlatformAdminSectionProps {
  id: string
  title: string
  icon: LucideIcon
  defaultOpen?: boolean
  children: ReactNode
}

export default function PlatformAdminSection({
  id,
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: PlatformAdminSectionProps) {
  return (
    <details id={id} className="card group" open={defaultOpen || undefined}>
      <summary className="list-none cursor-pointer select-none p-6 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Icon size={18} />
          {title}
        </h2>
        <ChevronDown
          size={18}
          className="text-gray-400 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="px-6 pb-6 pt-0 space-y-4 border-t border-gray-100">{children}</div>
    </details>
  )
}
