import { useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const DEBOUNCE_MS = 400

interface OrgChannelEntry {
  channel: RealtimeChannel
  listeners: Set<() => void>
  debounceTimer: ReturnType<typeof setTimeout> | null
}

const registry = new Map<string, OrgChannelEntry>()

function getOrCreateEntry(orgId: string): OrgChannelEntry {
  const existing = registry.get(orgId)
  if (existing) return existing

  const entry: OrgChannelEntry = { channel: null as unknown as RealtimeChannel, listeners: new Set(), debounceTimer: null }

  const fanOut = () => {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
    entry.debounceTimer = setTimeout(() => {
      entry.debounceTimer = null
      entry.listeners.forEach((listener) => listener())
    }, DEBOUNCE_MS)
  }

  entry.channel = supabase
    .channel(`org-leads-${orgId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'leads', filter: `org_id=eq.${orgId}` },
      fanOut
    )
    .subscribe()

  registry.set(orgId, entry)
  return entry
}

/**
 * One realtime channel per org, shared across every component that mounts this
 * hook for the same org. Before this, AssignedLeads, useLeadsPoolCount,
 * EmployeeDashboard, ManagerDashboard and LeadsPage each opened their own
 * `leads` table channel with a static name, so a manager on the leads board
 * could hold several concurrent subscriptions to the same table (and two
 * browser tabs on a static channel name could even collide). Fan-out to
 * listeners is debounced 400ms so a burst of changes (e.g. a bulk import)
 * triggers one refetch per listener, not one per row.
 */
export function useOrgLeadsRealtime(orgId: string | null | undefined, onChange: () => void): void {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!orgId) return

    const entry = getOrCreateEntry(orgId)
    const listener = () => onChangeRef.current()
    entry.listeners.add(listener)

    return () => {
      entry.listeners.delete(listener)
      if (entry.listeners.size === 0) {
        if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
        supabase.removeChannel(entry.channel)
        registry.delete(orgId)
      }
    }
  }, [orgId])
}
