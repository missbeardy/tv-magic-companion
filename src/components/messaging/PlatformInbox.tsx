import { useState } from 'react'
import { ArrowLeft, Inbox, Megaphone, Send } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { supabase } from '../../lib/supabase'
import { formatTime, type SupportMessage } from '../../lib/messaging'
import { useSupportThread } from './useSupportThread'
import { useSupportInbox } from './useSupportInbox'
import ChatThread from './ChatThread'

type View = 'threads' | 'thread' | 'announce'

/**
 * Platform-admin only. Cosmetic gate — real enforcement is RLS.
 * Left: thread list. Right/second screen: selected thread + reply.
 * Plus a separated announcement composer with a confirm step.
 */
export default function PlatformInbox() {
  const { profile } = useAuth()
  const theme = useTheme()
  const myId = profile?.id ?? null

  const { threads, loading } = useSupportInbox(true)
  const [selected, setSelected] = useState<string | null>(null)
  // Mobile drives a single-screen flow; desktop shows list + thread together.
  const [mobileView, setMobileView] = useState<View>('threads')

  const { messages, send, remove } = useSupportThread(selected, myId)

  const retry = (m: SupportMessage) => {
    remove(m.id)
    void send(m.body)
  }

  const openThread = (ownerId: string) => {
    setSelected(ownerId)
    setMobileView('thread')
  }

  const selectedThread = threads.find((t) => t.ownerId === selected)

  const ThreadList = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Inbox size={15} /> Support inbox
        </span>
        <button
          type="button"
          onClick={() => setMobileView('announce')}
          className="text-xs font-medium flex items-center gap-1 hover:underline"
          style={{ color: theme.primary }}
        >
          <Megaphone size={13} /> Announce
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
        ) : threads.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-8 px-6">
            No support threads yet.
          </div>
        ) : (
          threads.map((t) => (
            <button
              key={t.ownerId}
              type="button"
              onClick={() => openThread(t.ownerId)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 ${
                selected === t.ownerId ? 'bg-gray-50' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-800 truncate">{t.ownerName}</span>
                <span className="text-[10px] text-gray-400 shrink-0">{formatTime(t.lastAt)}</span>
              </div>
              <div className="text-[11px] text-gray-400 truncate">{t.orgName}</div>
              <div className="text-xs text-gray-500 truncate mt-0.5">{t.lastBody}</div>
            </button>
          ))
        )}
      </div>
    </div>
  )

  const ThreadPane = selected ? (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 shrink-0">
        <button
          type="button"
          onClick={() => setMobileView('threads')}
          className="md:hidden text-gray-500"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-800 truncate">
            {selectedThread?.ownerName ?? 'Thread'}
          </div>
          {selectedThread && (
            <div className="text-[11px] text-gray-400 truncate">{selectedThread.orgName}</div>
          )}
        </div>
      </div>
      <ChatThread
        messages={messages}
        currentUserId={myId ?? ''}
        onSend={send}
        onRetry={retry}
        emptyText="No messages in this thread yet."
        placeholder="Reply to this user…"
      />
    </div>
  ) : (
    <div className="h-full flex items-center justify-center text-sm text-gray-400">
      Select a thread to reply.
    </div>
  )

  if (mobileView === 'announce') {
    return <AnnouncementComposer myId={myId} onClose={() => setMobileView('threads')} />
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden h-[70vh] flex">
      {/* Desktop: list + thread side by side. Mobile: one at a time. */}
      <div
        className={`w-full md:w-72 md:border-r border-gray-200 shrink-0 ${
          mobileView === 'thread' ? 'hidden md:flex md:flex-col' : 'flex flex-col'
        }`}
      >
        {ThreadList}
      </div>
      <div
        className={`flex-1 min-w-0 ${mobileView === 'thread' ? 'flex flex-col' : 'hidden md:flex md:flex-col'}`}
      >
        {ThreadPane}
      </div>
    </div>
  )
}

function AnnouncementComposer({
  myId,
  onClose,
}: {
  myId: string | null
  onClose: () => void
}) {
  const theme = useTheme()
  const [body, setBody] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const doSend = async () => {
    if (!myId || !body.trim()) return
    setSending(true)
    setError('')
    const { error } = await supabase
      .from('platform_announcements')
      .insert({ sender_id: myId, body: body.trim() })
    setSending(false)
    setConfirming(false)
    if (error) {
      setError(error.message)
      return
    }
    setBody('')
    setSent(true)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Megaphone size={15} /> New announcement
        </h3>
        <button type="button" onClick={onClose} className="text-xs text-gray-500 hover:underline">
          ← Back to inbox
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Announcements are read-only for every user on the platform. Users cannot reply.
      </p>

      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          setSent(false)
        }}
        rows={5}
        maxLength={4000}
        placeholder="Write an announcement for all users…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2"
        style={{ ['--tw-ring-color' as string]: theme.primary }}
      />

      {error && <div className="text-sm text-red-600">{error}</div>}
      {sent && <div className="text-sm text-green-600">Announcement sent to all users.</div>}

      {confirming ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-3">
          <p className="text-sm text-amber-800 font-medium">
            This goes to every user on the platform. Send it?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={doSend}
              disabled={sending}
              className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-1.5"
              style={{ backgroundColor: theme.primary }}
            >
              <Send size={14} /> {sending ? 'Sending…' : 'Yes, send to everyone'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!body.trim()}
          className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5"
          style={{ backgroundColor: theme.primary }}
        >
          <Megaphone size={14} /> Send announcement
        </button>
      )}
    </div>
  )
}
