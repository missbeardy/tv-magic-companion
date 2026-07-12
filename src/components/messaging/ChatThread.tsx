import { useEffect, useRef, useState } from 'react'
import { Send, RotateCw } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { dayKey, formatDayLabel, formatTime, type SupportMessage } from '../../lib/messaging'

interface ChatThreadProps {
  messages: SupportMessage[]
  currentUserId: string
  onSend: (body: string) => void | Promise<void>
  onRetry?: (msg: SupportMessage) => void
  emptyText: string
  placeholder?: string
}

/** WhatsApp-style conversation: own messages right in brand colour, others left. */
export default function ChatThread({
  messages,
  currentUserId,
  onSend,
  onRetry,
  emptyText,
  placeholder = 'Type a message…',
}: ChatThreadProps) {
  const theme = useTheme()
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void onSend(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  let lastDay = ''

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-sm text-gray-400 px-6">
            {emptyText}
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === currentUserId
            const showDay = dayKey(m.created_at) !== lastDay
            lastDay = dayKey(m.created_at)
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="flex justify-center my-3">
                    <span className="text-[11px] font-medium text-gray-400 bg-gray-100 rounded-full px-3 py-0.5">
                      {formatDayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                      mine ? 'text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    } ${m._failed ? 'opacity-60' : ''}`}
                    style={mine ? { backgroundColor: theme.primary } : undefined}
                  >
                    {m.body}
                    <div
                      className={`mt-0.5 text-[10px] ${
                        mine ? 'text-white/70 text-right' : 'text-gray-400'
                      }`}
                    >
                      {m._failed ? (
                        <button
                          type="button"
                          onClick={() => onRetry?.(m)}
                          className="inline-flex items-center gap-1 text-red-200 hover:text-white"
                        >
                          <RotateCw size={11} /> Failed — retry
                        </button>
                      ) : (
                        formatTime(m.created_at)
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 p-2.5 flex items-end gap-2 bg-white">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none max-h-32 border border-gray-200 rounded-2xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
          style={{ ['--tw-ring-color' as string]: theme.primary }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-40 transition"
          style={{ backgroundColor: theme.primary }}
          aria-label="Send"
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  )
}
