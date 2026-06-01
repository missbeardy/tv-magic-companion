import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { isRunningLow } from '../lib/timer'

export default function TimerWatcher() {
  const { profile } = useAuth()

  useEffect(() => {
    if (!profile || profile.role !== 'employee') return

    async function checkTimers() {
      const { data } = await supabase
        .from('leads')
        .select('id, name, timer_expires_at')
        .eq('status', 'assigned')
        .eq('assigned_to', profile!.id)

      if (!data) return

      for (const lead of data) {
        if (!lead.timer_expires_at) continue
        if (!isRunningLow(lead.timer_expires_at)) continue

        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('lead_id', lead.id)
          .eq('type', 'timer_low')
          .eq('user_id', profile!.id)
          .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

        if (existing && existing.length > 0) continue

        await supabase.from('notifications').insert({
          user_id: profile!.id,
          title: 'Timer Running Low',
          message: `Your lead "${lead.name}" is about to expire. Update it now!`,
          type: 'timer_low',
          lead_id: lead.id,
        })
      }
    }

    checkTimers()
    const interval = setInterval(checkTimers, 30000)
    return () => clearInterval(interval)
  }, [profile])

  return null
}