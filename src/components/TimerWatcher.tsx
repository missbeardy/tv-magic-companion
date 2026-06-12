// src/components/TimerWatcher.tsx
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
        .select('id, name, timer_expires_at, status')
        .eq('status', 'assigned')
        .eq('assigned_to', profile!.id)

      if (!data) return

      for (const lead of data) {
        if (!lead.timer_expires_at) continue

        // 🆕 Check if timer has expired
        const expiresAt = new Date(lead.timer_expires_at).getTime()
        const now = Date.now()
        if (expiresAt <= now) {
          // Lead expired – unassign it
          await supabase
            .from('leads')
            .update({ 
              status: 'unassigned', 
              assigned_to: null, 
              assigned_at: null,
              timer_expires_at: null 
            })
            .eq('id', lead.id)

          // Add an event log
          await supabase.from('lead_events').insert({
            lead_id: lead.id,
            event_type: 'expired',
            note: `Lead expired without completion. Unassigned.`,
            created_by: profile!.id,
          })

          // Notify the employee
          await supabase.from('notifications').insert({
            user_id: profile!.id,
            title: 'Lead Expired',
            message: `Your lead "${lead.name}" has expired and been returned to the unassigned pool.`,
            type: 'lead_expired',
            lead_id: lead.id,
          })
          continue
        }

        // Existing low timer notification logic
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
    const interval = setInterval(checkTimers, 30000) // every 30 seconds
    return () => clearInterval(interval)
  }, [profile])

  return null
}