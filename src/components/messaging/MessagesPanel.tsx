import { useState } from 'react'
import { Megaphone, MessageSquare } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { formatDayLabel, formatTime, type SupportMessage } from '../../lib/messaging'
import { useSupportThread } from './useSupportThread'
import { useAnnouncements } from './useAnnouncements'
import ChatThread from './ChatThread'

type Tab = 'messages' | 'announcements'

/** User-facing panel: their 1:1 support thread + a read-only announcements feed. */
export default function MessagesPanel() {
  const { profile } = useAuth()
  const theme = useTheme()
  const [tab, setTab] = useState<Tab>('messages')
  const myId = profile?.id ?? null

  const { messages, send, remove } = useSupportThread(myId, myId)
  const { announcements, loading: annLoading } = useAnnouncements()

  const retry = (m: SupportMessage) => {
    remove(m.id)
    void send(m.body)
  }

  const tabBtn = (key: Tab, label: string, Icon: typeof MessageSquare) => {
    const active = tab === key
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition ${
          active ? '' : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
        style={active ? { borderColor: theme.primary, color: theme.primary } : undefined}
      >
        <Icon size={15} /> {label}
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col h-[70vh]">
      <div className="flex border-b border-gray-200 shrink-0">
        {tabBtn('messages', 'Messages', MessageSquare)}
        {tabBtn('announcements', 'Announcements', Megaphone)}
      </div>

      {tab === 'messages' ? (
        <ChatThread
          messages={messages}
          currentUserId={myId ?? ''}
          onSend={send}
          onRetry={retry}
          emptyText="No messages yet. Anything you send here goes straight to FieldBourne support."
          placeholder="Message FieldBourne support…"
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {annLoading ? (
            <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
          ) : announcements.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-8">
              No announcements yet.
            </div>
          ) : (
            announcements.map((a) => (
              <div key={a.id} className="rounded-xl border border-gray-200 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-white rounded-full px-2 py-0.5"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <Megaphone size={11} /> FieldBourne
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {formatDayLabel(a.created_at)} · {formatTime(a.created_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{a.body}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
