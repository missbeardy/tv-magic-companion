import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BOOKING_NUDGE_TITLES,
  BOOKING_OVERDUE_NUDGE_COOLDOWN_MS,
  EMPLOYEE_NUDGE_TITLES,
  buildEmployeeBookingNudge,
  buildManagerBookingDigest,
  isBookingOverdue,
  latestBookingByLead,
  type BookingWindow,
  type OverdueLeadSummary,
} from '../../shared/bookingOverdue.js'
import { isWithinQuietHours } from './bookingReminderPolicy.js'
import { insertTrustedBookingNudge } from './notifyUser.js'
import { log } from './log.js'

const LEAD_ID_CHUNK = 80
const DEFAULT_TIMEZONE = 'Australia/Brisbane'

export interface BookingOverdueSweepResult {
  overdue: number
  employeesNudged: number
  digests: number
  errors: string[]
}

interface BookedLeadRow {
  id: string
  org_id: string
  name: string | null
  assigned_to: string | null
}

async function fetchBookings(
  supabase: SupabaseClient,
  leadIds: string[]
): Promise<BookingWindow[]> {
  const rows: BookingWindow[] = []
  for (let i = 0; i < leadIds.length; i += LEAD_ID_CHUNK) {
    const { data, error } = await supabase
      .from('events')
      .select('lead_id, start_time, end_time')
      .in('lead_id', leadIds.slice(i, i + LEAD_ID_CHUNK))
    if (error) throw new Error(`events query: ${error.message}`)
    if (data) rows.push(...(data as BookingWindow[]))
  }
  return rows
}

/** True when this person already got a nudge with one of `titles` inside the cooldown. */
async function nudgedRecently(
  supabase: SupabaseClient,
  userId: string,
  titles: string[],
  sinceIso: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'calendar')
    .in('title', titles)
    .gte('created_at', sinceIso)
    .limit(1)
  // Fail closed: if we can't tell, don't risk a repeat every hour.
  if (error) throw new Error(`dedupe check ${userId}: ${error.message}`)
  return Boolean(data?.length)
}

/**
 * Booked leads whose last calendar booking ended more than the grace period ago (T1.21).
 * Each assignee gets ONE bell + push per cooldown covering all their overdue jobs, and each
 * manager one digest, only inside the org's 8am–8pm window. Dedupe is on the notifications
 * the sweep itself wrote, so no extra column is needed.
 */
export async function runBookingOverdueSweep(
  supabase: SupabaseClient,
  now = new Date()
): Promise<BookingOverdueSweepResult> {
  const result: BookingOverdueSweepResult = { overdue: 0, employeesNudged: 0, digests: 0, errors: [] }
  const nowMs = now.getTime()

  const { data: leadRows, error: leadsError } = await supabase
    .from('leads')
    .select('id, org_id, name, assigned_to')
    .eq('status', 'booked')
    .is('deleted_at', null)
    .not('org_id', 'is', null)
    .limit(2000)
  if (leadsError) {
    result.errors.push(`leads query: ${leadsError.message}`)
    return result
  }
  const booked = (leadRows ?? []) as BookedLeadRow[]
  if (!booked.length) return result

  const bookingByLead = latestBookingByLead(await fetchBookings(supabase, booked.map((l) => l.id)))
  const overdue = booked.filter((lead) =>
    isBookingOverdue('booked', bookingByLead.get(lead.id)?.end, nowMs)
  )
  result.overdue = overdue.length
  if (!overdue.length) return result

  const orgIds = [...new Set(overdue.map((l) => l.org_id))]
  const { data: orgRows } = await supabase.from('orgs').select('id, timezone').in('id', orgIds)
  const timezoneByOrg = new Map<string, string>(
    (orgRows ?? []).map((o: { id: string; timezone: string | null }) => [o.id, o.timezone || DEFAULT_TIMEZONE])
  )
  const awake = overdue.filter((lead) =>
    isWithinQuietHours(now, timezoneByOrg.get(lead.org_id) ?? DEFAULT_TIMEZONE)
  )
  if (!awake.length) {
    log.info('[BOOKING_OVERDUE_SWEEP]', result)
    return result
  }

  const sinceIso = new Date(nowMs - BOOKING_OVERDUE_NUDGE_COOLDOWN_MS).toISOString()

  // ── Employee nudges: one per assignee ────────────────────────────────
  const byAssignee = new Map<string, { orgId: string; userId: string; leads: OverdueLeadSummary[] }>()
  for (const lead of awake) {
    if (!lead.assigned_to) continue
    const key = `${lead.org_id}:${lead.assigned_to}`
    const entry = byAssignee.get(key) ?? { orgId: lead.org_id, userId: lead.assigned_to, leads: [] }
    entry.leads.push({ id: lead.id, name: lead.name, start: bookingByLead.get(lead.id)!.start })
    byAssignee.set(key, entry)
  }

  for (const { orgId, userId, leads } of byAssignee.values()) {
    try {
      if (await nudgedRecently(supabase, userId, EMPLOYEE_NUDGE_TITLES, sinceIso)) continue
      const nudge = buildEmployeeBookingNudge(leads, timezoneByOrg.get(orgId))
      const notify = await insertTrustedBookingNudge({
        supabase,
        orgId,
        userId,
        title: nudge.title,
        message: nudge.message,
        url: nudge.url,
        ...(nudge.leadId ? { leadId: nudge.leadId } : {}),
      })
      if (notify.ok) result.employeesNudged += 1
      else if (notify.error) result.errors.push(`${userId} nudge: ${notify.error}`)
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  // ── Manager digests: one per manager ─────────────────────────────────
  const countByOrg = new Map<string, number>()
  for (const lead of awake) countByOrg.set(lead.org_id, (countByOrg.get(lead.org_id) ?? 0) + 1)

  for (const [orgId, count] of countByOrg) {
    const { data: managers, error: managersError } = await supabase
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)
      .eq('role', 'manager')
    if (managersError) {
      result.errors.push(`${orgId} managers: ${managersError.message}`)
      continue
    }

    for (const manager of (managers ?? []) as { id: string }[]) {
      try {
        if (await nudgedRecently(supabase, manager.id, [BOOKING_NUDGE_TITLES.manager], sinceIso)) continue
        const { title, message } = buildManagerBookingDigest(count)
        const notify = await insertTrustedBookingNudge({
          supabase,
          orgId,
          userId: manager.id,
          title,
          message,
          url: '/leads',
        })
        if (notify.ok) result.digests += 1
        else if (notify.error) result.errors.push(`${manager.id} digest: ${notify.error}`)
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err))
      }
    }
  }

  log.info('[BOOKING_OVERDUE_SWEEP]', result)
  return result
}
