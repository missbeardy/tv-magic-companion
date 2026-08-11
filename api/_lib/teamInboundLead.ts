import type { SupabaseClient } from '@supabase/supabase-js'
import { pickTeamAutoAssignee, selectAssignmentPool } from '../../shared/teamAutoAssign.js'
import {
  buildExclusionHaystack,
  filterExcludedCandidates,
} from '../../shared/serviceExclusions.js'
import { getAssignExpiresAt } from '../../shared/leadAssignTimer.js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { isSoloOrg } from './soloInboundLead.js'
import { geocodeWithGoogle, geocodeWithNominatim } from './staticMap.js'

export interface TeamInboundAssignmentResult {
  payload: Record<string, unknown>
  inboundAutoAssign?: { assigneeId: string; assigneeName: string }
}

export async function geocodeLeadAddress(
  address: string | null | undefined
): Promise<{ lat: number; lng: number } | null> {
  if (!address?.trim()) return null

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim()
  let geocoded = apiKey ? await geocodeWithGoogle(address, apiKey) : null
  if (!geocoded) {
    const fallback = await geocodeWithNominatim(address)
    if (fallback) geocoded = { ...fallback, formattedAddress: address.trim() }
  }

  return geocoded ? { lat: geocoded.lat, lng: geocoded.lng } : null
}

/** Apply team inbound auto-assign when feature switch is on and org is in team mode. */
export async function applyTeamInboundAssignment(
  supabase: SupabaseClient,
  orgId: string,
  basePayload: Record<string, unknown>
): Promise<TeamInboundAssignmentResult> {
  if (basePayload.status !== 'unassigned') {
    return { payload: basePayload }
  }

  if (await isSoloOrg(supabase, orgId)) {
    return { payload: basePayload }
  }

  if (!(await isFeatureEnabledForOrg(orgId, 'inbound_auto_assign'))) {
    return { payload: basePayload }
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, lat, lng, created_at, role, excluded_service_keywords')
    .eq('org_id', orgId)
    .in('role', ['employee', 'manager'])
    .eq('is_hidden_test_profile', false)
    .order('created_at', { ascending: true })

  if (!profiles?.length) {
    return { payload: basePayload }
  }

  let techs = profiles.filter((p) => p.role === 'employee')
  let managers = profiles.filter((p) => p.role === 'manager')

  // Skip anyone flagged as unable to do this kind of work (T1.14). Matched against
  // the customer's own words, not `service_type` — that column is free text with no
  // catalog and still holds the raw-first placeholder at this point in the pipeline,
  // because auto-assign runs before Claude extraction resolves it.
  //
  // Filtering BOTH lists here is deliberate, and so is suppressing the manager
  // fallback when anything matched: that fallback exists for "nobody is around"
  // (everyone on leave), not "nobody is qualified". Without this, excluding every
  // technician silently routed specialist work onto a manager — observed in prod
  // 11-08-2026 on a "This is a test" lead. When an exclusion matches and no
  // eligible technician remains, the lead stays unassigned in the pool and the
  // manager new-lead alert fires instead.
  let exclusionMatched = false
  if (await isFeatureEnabledForOrg(orgId, 'assignment_exclusions')) {
    const haystack = buildExclusionHaystack([
      basePayload.service_type,
      basePayload.details,
      basePayload.raw_sms,
      basePayload.raw_email,
    ])
    if (haystack) {
      const eligibleTechs = filterExcludedCandidates(techs, haystack)
      const eligibleManagers = filterExcludedCandidates(managers, haystack)
      exclusionMatched =
        eligibleTechs.length !== techs.length || eligibleManagers.length !== managers.length
      techs = eligibleTechs
      managers = eligibleManagers
    }
  }

  // Skip technicians who have blocked out today as leave. A block-out is an
  // `events` row with category 'Leave' spanning the full day(s) — see
  // src/components/BlackoutModal.tsx. Managers are used only as a fallback when
  // every technician is on leave, and that fallback intentionally ignores leave.
  const nowIso = new Date().toISOString()
  const { data: leaveRows } = await supabase
    .from('events')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('category', 'Leave')
    .lte('start_time', nowIso)
    .gte('end_time', nowIso)
  const onLeaveIds = new Set(
    (leaveRows ?? []).map((r) => r.user_id).filter((id): id is string => Boolean(id))
  )

  const candidates = selectAssignmentPool({
    techs,
    managers,
    onLeaveIds,
    allowManagerFallback: !exclusionMatched,
  })
  if (!candidates.length) {
    return { payload: basePayload }
  }

  const { data: activeLeads } = await supabase
    .from('leads')
    .select('assigned_to')
    .eq('org_id', orgId)
    .eq('status', 'assigned')
    .is('deleted_at', null)

  const activeCounts: Record<string, number> = {}
  activeLeads?.forEach((row) => {
    if (row.assigned_to) {
      activeCounts[row.assigned_to] = (activeCounts[row.assigned_to] ?? 0) + 1
    }
  })

  const address = typeof basePayload.address === 'string' ? basePayload.address : null
  const coords = await geocodeLeadAddress(address)

  const assigneeId = pickTeamAutoAssignee({
    candidates,
    activeCounts,
    leadLat: coords?.lat,
    leadLng: coords?.lng,
  })

  if (!assigneeId) {
    return { payload: basePayload }
  }

  const assignee = candidates.find((p) => p.id === assigneeId)
  const now = new Date().toISOString()

  return {
    payload: {
      ...basePayload,
      status: 'assigned',
      assigned_to: assigneeId,
      assigned_at: now,
      timer_expires_at: getAssignExpiresAt(),
    },
    inboundAutoAssign: {
      assigneeId,
      assigneeName: assignee?.full_name ?? 'team member',
    },
  }
}
