import { useOfflineQueue } from '../hooks/useOfflineQueue'

export default function OfflineBanner() {
  const { online, pendingCount, syncing, sync } = useOfflineQueue()

  if (online && pendingCount === 0 && !syncing) return null

  if (!online) {
    return (
      <div className="bg-amber-500 text-white text-sm text-center py-2 px-4 font-semibold">
        You&apos;re offline — showing your last saved leads &amp; schedule.
        {pendingCount > 0
          ? ` ${pendingCount} action${pendingCount === 1 ? '' : 's'} queued (calls, SMS, photos, completions, notes).`
          : ''}
      </div>
    )
  }

  if (syncing) {
    return (
      <div className="bg-sky-600 text-white text-sm text-center py-2 px-4 font-semibold">
        Syncing {pendingCount > 0 ? `${pendingCount} queued action${pendingCount === 1 ? '' : 's'}` : 'queued actions'}…
      </div>
    )
  }

  if (pendingCount > 0) {
    return (
      <div className="bg-amber-500 text-white text-sm text-center py-2 px-4 font-semibold flex items-center justify-center gap-3">
        <span>
          {pendingCount} queued action{pendingCount === 1 ? '' : 's'} waiting to sync.
        </span>
        <button
          type="button"
          onClick={() => void sync()}
          className="underline font-bold hover:no-underline"
        >
          Sync now
        </button>
      </div>
    )
  }

  return null
}
