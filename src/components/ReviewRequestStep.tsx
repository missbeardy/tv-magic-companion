import { MessageSquare, Star } from 'lucide-react'

interface Props {
  customerName: string
  customerPhone: string
  sending?: boolean
  error?: string | null
  onSend: () => void
  onSkip: () => void
  /** When embedded in the checklist flow, hide the outer title row. */
  embedded?: boolean
}

export default function ReviewRequestStep({
  customerName,
  customerPhone,
  sending = false,
  error,
  onSend,
  onSkip,
  embedded = false,
}: Props) {
  return (
    <div className="space-y-4">
      {!embedded && (
        <h2 className="text-lg font-bold text-[#004B93]">Job complete</h2>
      )}

      <div className="bg-[#004B93]/5 border border-[#004B93]/15 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#004B93]/10 flex items-center justify-center shrink-0">
            <Star size={18} className="text-[#004B93]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Ask for a review?</p>
            <p className="text-sm text-gray-600 mt-1">
              Send <span className="font-medium text-gray-800">{customerName}</span> a text at{' '}
              <span className="font-medium text-gray-800">{customerPhone}</span> with your review link.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <p className="text-xs text-gray-400">
        Turn review prompts off anytime in Franchise Settings.
      </p>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onSkip}
          disabled={sending}
          className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold disabled:opacity-50"
        >
          Not this time
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={sending}
          className="flex-1 py-3 rounded-xl bg-[#004B93] text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <MessageSquare size={16} />
          {sending ? 'Sending…' : 'Send text'}
        </button>
      </div>
    </div>
  )
}
