import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export interface ThreadSummary {
  ownerId: string
  ownerName: string
  orgName: string
  lastBody: string
  lastAt: string
}

/**
 * Platform-admin inbox: one summary row per distinct thread owner, newest first.
 * Admin visibility comes from RLS (support_messages + the platform-admin
 * profiles/orgs SELECT policies).
 */
export function useSupportInbox(enabled: boolean) {
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: msgs } = await supabase
      .from('support_messages')
      .select('user_id, org_id, body, created_at')
      .order('created_at', { ascending: false })

    const rows = (msgs ?? []) as Array<{
      user_id: string
      org_id: string
      body: string
      created_at: string
    }>

    // First row per owner is the most recent (query is DESC).
    const latest = new Map<string, (typeof rows)[number]>()
    for (const r of rows) if (!latest.has(r.user_id)) latest.set(r.user_id, r)

    const ownerIds = [...latest.keys()]
    const orgIds = [...new Set([...latest.values()].map((r) => r.org_id))]

    const [{ data: profs }, { data: orgs }] = await Promise.all([
      ownerIds.length
        ? supabase.from('profiles').select('id, full_name').in('id', ownerIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
      orgIds.length
        ? supabase.from('orgs').select('id, name').in('id', orgIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ])

    const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name]))
    const orgById = new Map((orgs ?? []).map((o) => [o.id, o.name]))

    const summaries: ThreadSummary[] = [...latest.values()].map((r) => ({
      ownerId: r.user_id,
      ownerName: nameById.get(r.user_id) || `User ${r.user_id.slice(0, 8)}`,
      orgName: orgById.get(r.org_id) || 'Unknown org',
      lastBody: r.body,
      lastAt: r.created_at,
    }))
    summaries.sort((a, b) => b.lastAt.localeCompare(a.lastAt))

    setThreads(summaries)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let active = true
    load()

    const channel = supabase
      .channel('support-inbox')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages' },
        () => {
          if (active) load()
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [enabled, load])

  return { threads, loading, reload: load }
}
