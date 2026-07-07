import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Announcement } from '../../lib/messaging'

/** Live read-only announcements feed, newest first. */
export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)

    supabase
      .from('platform_announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!active) return
        setAnnouncements((data ?? []) as Announcement[])
        setLoading(false)
      })

    const channel = supabase
      .channel('platform-announcements')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'platform_announcements' },
        (payload) => {
          if (!active) return
          const row = payload.new as Announcement
          setAnnouncements((prev) =>
            prev.some((a) => a.id === row.id) ? prev : [row, ...prev]
          )
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  return { announcements, loading }
}
