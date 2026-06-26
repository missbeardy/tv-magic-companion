import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isProfileVisibleToViewer } from '../lib/profileVisibility'

const FEED_LIMIT = 50
const FEED_HOURS = 24

export interface ActivityFeedRow {
  id: string
  event_type: string
  note: string | null
  payload: Record<string, unknown> | null
  created_at: string
  lead_id: string
  actor_id: string | null
  actorName: string | null
  actorAvatarUrl: string | null
  leadName: string | null
}

type RawEventRow = {
  id: string
  event_type: string
  note: string | null
  payload: Record<string, unknown> | null
  created_at: string
  lead_id: string
  actor_id: string | null
}

type ProfileRow = {
  id: string
  full_name: string
  avatar_url: string | null
  is_hidden_test_profile: boolean | null
  test_profile_owner_id: string | null
}

type LeadNameRow = {
  id: string
  name: string
}

const EVENT_SELECT = 'id, event_type, note, payload, created_at, lead_id, actor_id'

async function enrichFeedRows(
  rows: RawEventRow[],
  viewerId: string | undefined
): Promise<ActivityFeedRow[]> {
  if (rows.length === 0) return []

  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))] as string[]
  const leadIds = [...new Set(rows.map((row) => row.lead_id).filter(Boolean))]

  const [profilesRes, leadsRes] = await Promise.all([
    actorIds.length
      ? supabase
          .from('profiles')
          .select('id, full_name, avatar_url, is_hidden_test_profile, test_profile_owner_id')
          .in('id', actorIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    leadIds.length
      ? supabase.from('leads').select('id, name').in('id', leadIds)
      : Promise.resolve({ data: [] as LeadNameRow[], error: null }),
  ])

  if (profilesRes.error) {
    console.error('useTeamActivityFeed profile enrich:', profilesRes.error)
  }
  if (leadsRes.error) {
    console.error('useTeamActivityFeed lead enrich:', leadsRes.error)
  }

  const profileMap = new Map((profilesRes.data ?? []).map((profile) => [profile.id, profile]))
  const leadMap = new Map((leadsRes.data ?? []).map((lead) => [lead.id, lead.name]))

  return rows.map((row) => {
    const profile = row.actor_id ? profileMap.get(row.actor_id) : undefined
    const actorVisible =
      profile &&
      isProfileVisibleToViewer(
        {
          id: row.actor_id ?? '',
          is_hidden_test_profile: profile.is_hidden_test_profile,
          test_profile_owner_id: profile.test_profile_owner_id,
        },
        viewerId
      )

    return {
      id: row.id,
      event_type: row.event_type,
      note: row.note,
      payload: row.payload,
      created_at: row.created_at,
      lead_id: row.lead_id,
      actor_id: row.actor_id,
      actorName: actorVisible ? profile.full_name : row.actor_id ? 'Team member' : null,
      actorAvatarUrl: actorVisible ? profile.avatar_url : null,
      leadName: leadMap.get(row.lead_id) ?? null,
    }
  })
}

export function useTeamActivityFeed(orgId: string | undefined, viewerId: string | undefined) {
  const [events, setEvents] = useState<ActivityFeedRow[]>([])
  const [loading, setLoading] = useState(true)

  const sinceIso = useCallback(() => {
    const since = new Date()
    since.setHours(since.getHours() - FEED_HOURS)
    return since.toISOString()
  }, [])

  const fetchEventById = useCallback(
    async (eventId: string): Promise<ActivityFeedRow | null> => {
      const { data, error } = await supabase
        .from('lead_events')
        .select(EVENT_SELECT)
        .eq('id', eventId)
        .maybeSingle()

      if (error || !data) return null
      const enriched = await enrichFeedRows([data as RawEventRow], viewerId)
      return enriched[0] ?? null
    },
    [viewerId]
  )

  const fetchFeed = useCallback(async () => {
    if (!orgId) {
      setEvents([])
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('lead_events')
      .select(EVENT_SELECT)
      .eq('org_id', orgId)
      .gte('created_at', sinceIso())
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT)

    if (error) {
      console.error('useTeamActivityFeed:', error)
      setEvents([])
    } else {
      setEvents(await enrichFeedRows((data ?? []) as RawEventRow[], viewerId))
    }
    setLoading(false)
  }, [orgId, viewerId, sinceIso])

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    fetchFeed()

    const channel = supabase
      .channel(`team-activity-feed-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_events', filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const newId = (payload.new as { id?: string })?.id
          if (!newId) {
            fetchFeed()
            return
          }
          const row = await fetchEventById(newId)
          if (!row) {
            fetchFeed()
            return
          }
          setEvents((prev) => {
            if (prev.some((e) => e.id === row.id)) return prev
            return [row, ...prev].slice(0, FEED_LIMIT)
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, fetchFeed, fetchEventById])

  return { events, loading, refresh: fetchFeed }
}
