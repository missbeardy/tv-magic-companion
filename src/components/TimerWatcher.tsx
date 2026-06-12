// src/components/TimerWatcher.tsx
// Last updated: 13 June 2026
// - Unassigns leads when timer expires
// - Logs expiry event with employee ID for reporting
// - Sends push notification for low timer and expiry

import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { isRunningLow } from '../lib/timer'

export default function TimerWatcher() {
  const { profile } = useAuth()

  useEffect(() => {
    // Only employees have timers to watch
    if (!profile || profile.role !== 'employee') return

    async function checkTimers() {
      // Get all assigned leads for this employee
      const { data: leads } = await supabase
        .from('leads')
        .select('id, name, timer_expires_at, status')
        .eq('status', 'assigned')
        .eq('assigned_to', profile!.id)

      if (!leads) return

      const now = Date.now()

      for (const lead of leads) {
        if (!lead.timer_expires_at) continue

        const expiresAt = new Date(lead.timer_expires_at).getTime()
        const isExpired = expiresAt <= now

        // ──────────────────────────────────────────────
        // 1. Handle EXPIRED leads – unassign and log
        // ──────────────────────────────────────────────
        if (isExpired) {
          // Unassign the lead
          await supabase
            .from('leads')
            .update({
              status: 'unassigned',
              assigned_to: null,
              assigned_at: null,
              timer_expires_at: null
            })
            .eq('id', lead.id)

          // Log who let it expire (for reporting)
          await supabase.from('lead_events').insert({
            lead_id: lead.id,
            event_type: 'expired',
            note: `Lead expired while assigned to ${profile.full_name} (${profile.id})`,
            created_by: profile.id,  // ← tracks which employee
          })

          // Notify employee that lead expired
          await supabase.from('notifications').insert({
            user_id: profile.id,
            title: '⚠️ Lead Expired',
            message: `Your lead "${lead.name}" has expired and is back in the unassigned pool.`,
            type: 'lead_expired',
            lead_id: lead.id,
          })

          continue  // No need to check low timer for expired leads
        }

        // ──────────────────────────────────────────────
        // 2. Handle LOW timer (under 2 hours) – notify once per hour
        // ──────────────────────────────────────────────
        if (!isRunningLow(lead.timer_expires_at)) continue

        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('lead_id', lead.id)
          .eq('type', 'timer_low')
          .eq('user_id', profile.id)
          .gte('created_at', new Date(now - 60 * 60 * 1000).toISOString())

        if (existing && existing.length > 0) continue

        await supabase.from('notifications').insert({
          user_id: profile.id,
          title: '⏰ Timer Running Low',
          message: `Lead "${lead.name}" expires soon. Complete or reassign it.`,
          type: 'timer_low',
          lead_id: lead.id,
        })
      }
    }

    // Run immediately, then every 30 seconds
    checkTimers()
    const interval = setInterval(checkTimers, 30000)
    return () => clearInterval(interval)
  }, [profile])

  return null
}