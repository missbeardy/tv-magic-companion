import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export function useLeadsPoolCount(): number {
  const { profile } = useAuth()
  const [count, setCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (!profile?.org_id) return
    const { count: total, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)
      .eq('status', 'unassigned')
      .is('deleted_at', null)

    if (!error) setCount(total ?? 0)
  }, [profile?.org_id])

  useEffect(() => {
    if (!profile?.org_id) return
    fetchCount()
    const channel = supabase
      .channel(`leads-pool-${profile.org_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `org_id=eq.${profile.org_id}` },
        fetchCount
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.org_id, fetchCount])

  return count
}
