import { Sparkles, RefreshCw, X } from 'lucide-react'
import type { ChangelogEntry } from '../lib/changelog'
import { APP_VERSION } from '../lib/changelog'

interface Props {
  isOpen: boolean
  entries: ChangelogEntry[]
  updateAvailable: boolean
  updating: boolean
  onClose: () => void
  onUpdate: () => void
}

export default function ChangelogOverlay({
  isOpen,
  entries,
  updateAvailable,
  updating,
  onClose,
  onUpdate,
}: Props) {
  if (!isOpen) return null

  const hasChangelog = entries.length > 0
  const title = hasChangelog ? "What's New" : 'Update Available'
  const subtitle = hasChangelog
    ? `Version ${APP_VERSION}`
  : 'A newer version of the app is ready to install.'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-title"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                {updateAvailable ? (
                  <RefreshCw size={18} className="text-brand" aria-hidden="true" />
                ) : (
                  <Sparkles size={18} className="text-brand" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <h2 id="changelog-title" className="font-display font-bold text-gray-900 text-lg leading-tight">
                  {title}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {updateAvailable && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Tap <strong>Update now</strong> to refresh the app cache and load the latest version.
            </div>
          )}

          {hasChangelog ? (
            entries.map((entry) => (
              <section key={entry.version}>
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <h3 className="font-display font-semibold text-gray-900 text-sm">
                    {entry.title}
                  </h3>
                  <span className="text-xs text-gray-400 shrink-0">{entry.date}</span>
                </div>
                <ul className="space-y-2">
                  {entry.items.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-gray-600 leading-snug">
                      <span className="text-brand-secondary shrink-0 mt-0.5" aria-hidden="true">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="text-sm text-gray-600">
              This update includes bug fixes and improvements. Update now to stay on the latest build.
            </p>
          )}
        </div>

        <div className="px-6 pb-6 pt-2 border-t border-gray-100 shrink-0 flex flex-col gap-2">
          {updateAvailable && (
            <button
              type="button"
              onClick={onUpdate}
              disabled={updating}
              className="w-full py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-95 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} className={updating ? 'animate-spin' : ''} aria-hidden="true" />
              {updating ? 'Updating…' : 'Update now'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={updating}
            className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
              updateAvailable
                ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                : 'bg-brand text-white hover:opacity-95'
            }`}
          >
            {updateAvailable ? 'Later' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  )
}
