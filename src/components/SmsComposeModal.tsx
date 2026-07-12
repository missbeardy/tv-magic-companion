import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  customerName: string
  onCancel: () => void
  onSend: (text: string) => void
}

/** Free-text SMS composer. The technician types the message, then Send hands it
 *  to the device SMS app. */
export default function SmsComposeModal({ customerName, onCancel, onSend }: Props) {
  const [text, setText] = useState('')
  const trimmed = text.trim()

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden />
      <div
        className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl animate-slide-up"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-base">What would you like to SMS?</h2>
          <button
            type="button"
            onClick={onCancel}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 mb-2">To {customerName || 'this lead'}</p>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Type your message…"
            className="w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
          />
        </div>

        <div
          className="flex gap-2 px-5 pt-1 pb-4 border-t border-gray-100"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-semibold text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={() => onSend(trimmed)}
            className="flex-1 py-3 rounded-xl font-semibold text-sm text-white bg-[var(--color-primary)] disabled:opacity-40 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
