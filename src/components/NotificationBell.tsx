// src/components/NotificationBell.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Bell } from 'lucide-react'

export default function NotificationBell() {
  const { profile } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!profile) return

    async function fetchUnread() {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile!.id)
        .eq('read', false)
      setUnread(count ?? 0)
    }

    fetchUnread()

    const channel = supabase
      .channel('notification-bell')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, fetchUnread)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])

  return (
    <button className="relative p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
      <Bell size={18} />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
          <span className="text-white font-bold text-[9px] leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        </span>
      )}
    </button>
  )
}