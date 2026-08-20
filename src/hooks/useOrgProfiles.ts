import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { filterVisibleProfiles, type ProfileVisibilityFields } from '../lib/profileVisibility'

export interface OrgProfile extends ProfileVisibilityFields {
  id: string
  full_name: string
  avatar_url?: string | null
  phone?: string | null
  suburb?: string | null
  role: 'manager' | 'employee' | 'platform_admin'
  lat?: number | null
  lng?: number | null
  org_id?: string
  /** Job types this person cannot do — see shared/serviceExclusions.ts (T1.14). */
  excluded_service_keywords?: string[] | null
  /** Set once this person has left. NULL means active. */
  departed_at?: string | null
}

export function useOrgProfiles() {
  const { profile } = useAuth()

  /**
   * Departed people are dropped by default: every caller but the history views wants the
   * roster of who can be given work today. Pass `includeDeparted` to get the full cast for
   * a past period, and label them from `departed_at` when you do.
   */
  const fetchOrgProfiles = useCallback(
    async (options?: {
      roles?: Array<'manager' | 'employee' | 'platform_admin'>
      includeDeparted?: boolean
    }) => {
      if (!profile?.org_id) return [] as OrgProfile[]

      let query = supabase
        .from('profiles')
        .select(
          'id, full_name, avatar_url, phone, suburb, role, lat, lng, org_id, is_hidden_test_profile, test_profile_owner_id, excluded_service_keywords, departed_at'
        )
        .eq('org_id', profile.org_id)

      if (options?.roles?.length) {
        query = query.in('role', options.roles)
      }

      if (!options?.includeDeparted) {
        query = query.is('departed_at', null)
      }

      const { data, error } = await query
      if (error) {
        console.error('fetchOrgProfiles:', error)
        return [] as OrgProfile[]
      }

      return filterVisibleProfiles((data ?? []) as OrgProfile[], profile.id)
    },
    [profile?.org_id, profile?.id]
  )

  return { fetchOrgProfiles, orgId: profile?.org_id, viewerId: profile?.id }
}
