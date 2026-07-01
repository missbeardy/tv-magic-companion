// src/components/NotificationBell.tsx
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Bell, X } from 'lucide-react'
import { timeAgo } from '../lib/timeAgo'

interface Notification {
  id: string
  title: string
  message: string
  type: string
  read: boolean
  created_at: string
}

export default function NotificationBell() {
  const { profile } = useAuth()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Count unread — realtime subscription
  useEffect(() => {
    const userId = profile?.id
    if (!userId) return

    async function fetchUnread() {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false)
      setUnread(count ?? 0)
    }

    fetchUnread()

    const channel = supabase
      .channel(`notification-bell-${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, fetchUnread)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Load notifications and mark all read when panel opens
  async function handleOpen() {
    if (!profile) return
    const next = !open
    setOpen(next)
    if (!next) return

    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('id, title, message, type, read, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20)

    setNotifications((data as Notification[]) ?? [])
    setLoading(false)

    // Mark all unread → read
    if (unread > 0) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', profile.id)
        .eq('read', false)
      setUnread(0)
    }
  }

  const typeIcon: Record<string, string> = {
    new_lead: '📥',
    lead_expired: '⚠️',
    timer_low: '⏰',
    lead_assigned: '✅',
    contact_follow_up: '📞',
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-[9px] leading-none">
              {unread > 9 ? '9+' : unread}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Notifications</p>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <p className="text-center text-gray-400 text-sm py-8">Loading…</p>
            )}

            {!loading && notifications.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">No notifications yet</p>
            )}

            {!loading && notifications.map(n => (
              <div
                key={n.id}
                className={`px-4 py-3 border-b border-gray-50 last:border-0 ${
                  !n.read ? 'bg-blue-50/50' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base mt-0.5 shrink-0">
                    {typeIcon[n.type] ?? '🔔'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-snug">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}