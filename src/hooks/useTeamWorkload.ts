import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrgProfiles } from './useOrgProfiles'

export interface TeamWorkloadRow {
  id: string
  full_name: string
  avatar_url?: string | null
  activeCount: number
}

export function useTeamWorkload() {
  const { fetchOrgProfiles, orgId } = useOrgProfiles()
  const [techs, setTechs] = useState<TeamWorkloadRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWorkload = useCallback(async () => {
    if (!orgId) {
      setTechs([])
      setLoading(false)
      return
    }

    const { data: leads } = await supabase
      .from('leads')
      .select('status, assigned_to')
      .eq('org_id', orgId)

    const countMap: Record<string, number> = {}
    ;(leads ?? [])
      .filter((l) => l.status === 'assigned')
      .forEach((l) => {
        if (l.assigned_to) {
          countMap[l.assigned_to] = (countMap[l.assigned_to] ?? 0) + 1
        }
      })

    const profiles = await fetchOrgProfiles({ roles: ['employee', 'manager'] })
    const rows = profiles
      .map((p) => ({
        id: p.id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        activeCount: countMap[p.id] ?? 0,
      }))
      .sort((a, b) => b.activeCount - a.activeCount || a.full_name.localeCompare(b.full_name))

    setTechs(rows)
    setLoading(false)
  }, [orgId, fetchOrgProfiles])

  useEffect(() => {
    if (!orgId) return
    fetchWorkload()
    const channel = supabase
      .channel(`team-workload-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchWorkload)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, fetchWorkload])

  return { techs, loading, refresh: fetchWorkload }
}
