import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { usePwaUpdateContext } from '../context/PwaUpdateContext'

export default function AppRefreshButton() {
  const { updateAvailable, updating, applyUpdate, supported } = usePwaUpdateContext()
  const [reloading, setReloading] = useState(false)

  if (!supported) return null

  function handleClick() {
    if (updateAvailable) {
      applyUpdate()
      return
    }
    setReloading(true)
    window.location.reload()
  }

  const spinning = updating || reloading

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={spinning}
      className="relative p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-60"
      aria-label={updateAvailable ? 'App update available — refresh' : 'Refresh app'}
      title={updateAvailable ? 'Update available — tap to refresh' : 'Refresh app'}
    >
      <RefreshCw size={18} className={spinning ? 'animate-spin' : ''} aria-hidden="true" />
      {updateAvailable && !spinning && (
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[var(--color-primary)]" />
      )}
    </button>
  )
}
