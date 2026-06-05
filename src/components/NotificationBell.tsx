import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'

interface Notification {
  id: string
  title: string
  message: string
  type: string
  read: boolean
  created_at: string
  lead_id?: string
}

export default function NotificationBell() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setNotifications(data)
  }, [profile?.id])

  async function markAllRead() {
    if (!profile?.id) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', profile.id)
      .eq('read', false)
    fetchNotifications()
  }

  async function handleNotificationClick(n: Notification) {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', n.id)
    
    fetchNotifications()
    setOpen(false)

    if (n.lead_id) {
      window.location.href = `/leads?leadId=${n.lead_id}`
    } else {
      window.location.href = '/leads'
    }
  }

  useEffect(() => {
    if (!profile?.id) return

    fetchNotifications()

    const channelName = `notifications-${profile.id}-${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        () => fetchNotifications()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id, fetchNotifications])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length
  const { isSupported, isSubscribed, subscribe, unsubscribe, loading } = usePushNotifications()

  function typeIcon(type: string) {
    if (type === 'lead_assigned') return '📋'
    if (type === 'timer_low') return '⚠️'
    if (type === 'lead_expired') return '🔴'
    return '🔔'
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); if (!open) markAllRead() }}
        className="relative p-2 rounded-lg hover:bg-white hover:bg-opacity-20 transition"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
          <div className="p-4 border-b border-gray-100">
  <div className="flex items-center justify-between mb-2">
    <h3 className="font-semibold text-gray-800">Notifications</h3>
    {unreadCount > 0 && (
      <button onClick={markAllRead} className="text-xs text-[#004B93] hover:underline">
        Mark all read
      </button>
    )}
  </div>
  
        {/* PUSH NOTIFICATION TOGGLE */}
           {isSupported && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              {isSubscribed ? '🔔 Push on' : '🔕 Push off'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                isSubscribed ? unsubscribe() : subscribe()
              }}
              disabled={loading}
              className={`text-xs px-2 py-1 rounded ${
                isSubscribed 
                  ? 'bg-gray-200 text-gray-700' 
                  : 'bg-[#004B93] text-white'
              }`}
            >
              {loading ? '...' : isSubscribed ? 'Disable' : 'Enable'}
            </button>
          </div>
        )}
      </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {notifications.length === 0 && (
              <p className="p-4 text-sm text-gray-400 text-center">No notifications yet.</p>
            )}
            {notifications.map(n => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-4 cursor-pointer hover:bg-gray-50 transition ${!n.read ? 'bg-blue-50' : ''}`}
              >
                <div className="flex gap-3">
                  <span className="text-lg">{typeIcon(n.type)}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
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