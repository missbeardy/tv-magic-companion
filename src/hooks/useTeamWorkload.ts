import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrgProfiles } from './useOrgProfiles'

export interface TeamWorkloadRow {
  id: string
  full_name: string
  avatar_url?: string | null
  assignedCount: number
  contactCount: number
  bookedCount: number
}

const PIPELINE_STATUSES = {
  assigned: 'assignedCount',
  contact_attempted: 'contactCount',
  booked: 'bookedCount',
} as const

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

    const countMaps: Record<string, Record<'assignedCount' | 'contactCount' | 'bookedCount', number>> = {}

    for (const lead of leads ?? []) {
      if (!lead.assigned_to) continue
      const statusKey = PIPELINE_STATUSES[lead.status as keyof typeof PIPELINE_STATUSES]
      if (!statusKey) continue

      if (!countMaps[lead.assigned_to]) {
        countMaps[lead.assigned_to] = { assignedCount: 0, contactCount: 0, bookedCount: 0 }
      }
      countMaps[lead.assigned_to][statusKey] += 1
    }

    const profiles = await fetchOrgProfiles({ roles: ['employee', 'manager'] })
    const rows = profiles
      .map((p) => ({
        id: p.id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        assignedCount: countMaps[p.id]?.assignedCount ?? 0,
        contactCount: countMaps[p.id]?.contactCount ?? 0,
        bookedCount: countMaps[p.id]?.bookedCount ?? 0,
      }))
      .sort((a, b) => {
        const totalA = a.assignedCount + a.contactCount + a.bookedCount
        const totalB = b.assignedCount + b.contactCount + b.bookedCount
        return totalB - totalA || a.full_name.localeCompare(b.full_name)
      })

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
