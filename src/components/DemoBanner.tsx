// src/components/DemoBanner.tsx
import { Zap, X } from 'lucide-react'
import { useState } from 'react'

export default function DemoBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="bg-amber-500 text-white">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap size={14} className="shrink-0" />
          <p className="text-sm font-semibold">
            Demo mode active — lead timers set to 30 seconds
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg hover:bg-white/20 transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}