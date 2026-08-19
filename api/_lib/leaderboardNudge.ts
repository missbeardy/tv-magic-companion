import type { SupabaseClient } from '@supabase/supabase-js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { sendPushToUsers } from './pushTransport.js'
import { getPlatformUrl } from './platformUrl.js'
import {
  getNudgeWeekStartKey,
  isNudgeWindow,
  type NudgePhase,
} from '../../shared/leaderboardWeek.js'

/**
 * Weekly leaderboard nudge.
 *
 * `remind` runs Saturday 5pm and tells the manager to post the week that is closing.
 * `reveal` runs Monday 8am and tells the team how *last* week finished — Monday's own
 * week is empty, so the two phases deliberately target different weeks. Gated per-brand
 * by `weekly_leaderboard_nudge` and, for the reveal, by there actually being results:
 * a notification that opens an empty board teaches people to ignore the notification.
 *
 * **In-app bell + push only.** Deliberately does NOT go through `notifyOrgUser`, which
 * fans out to SMS/WhatsApp for every `type` outside its two special cases. A weekly text
 * to every technician is real money and real annoyance; this is a scoreboard, not a job.
 */

export const NUDGE_NOTIFICATION_TYPES = {
  remind: 'leaderboard_remind',
  reveal: 'leaderboard_reveal',
} as const

export interface LeaderboardNudgeResult {
  phase: NudgePhase
  /** False when the cron fired outside the phase's business-hour window and did nothing. */
  inWindow: boolean
  weekStart: string
  orgs: number
  notified: number
  skippedNoResults: number
  skippedAlreadySent: number
  skippedNoRecipients: number
  errors: string[]
}

interface NudgeCopy {
  title: string
  message: string
  url: string
}

function buildCopy(phase: NudgePhase, weekStart: string): NudgeCopy {
  const base = getPlatformUrl()
  if (phase === 'remind') {
    return {
      title: 'Post this week’s results',
      message: 'The team sees them Monday morning and nothing is entered yet.',
      url: `${base}/leaderboard`,
    }
  }
  return {
    title: 'Last week’s results are in',
    message: 'See where you finished.',
    // `week` matters: by Monday morning the board has already rolled over, so the link
    // has to name the week being celebrated or it opens on an empty one.
    url: `${base}/leaderboard?reveal=1&week=${weekStart}`,
  }
}

async function findEnabledOrgIds(supabase: SupabaseClient): Promise<string[]> {
  const { data: orgRows, error } = await supabase.from('orgs').select('id')
  if (error || !orgRows?.length) return []

  const checks = await Promise.all(
    orgRows.map(async (row) => ({
      id: row.id as string,
      enabled: await isFeatureEnabledForOrg(row.id, 'weekly_leaderboard_nudge'),
    }))
  )
  return checks.filter((c) => c.enabled).map((c) => c.id)
}

/** Comfortably more than the ~1h between the two DST candidate ticks, comfortably less
 *  than the 7 days to the same phase's previous send. */
const DEDUPE_LOOKBACK_DAYS = 3

/**
 * Recipients who already got this phase's nudge for this occasion.
 *
 * The window is anchored to **now**, not to the week being scored. That distinction is
 * load-bearing for the reveal: it runs on the Monday *after* the week it celebrates, so
 * a window starting at the scored week's Monday would reach back over the previous
 * Monday's send and suppress every reveal after the first one, forever.
 *
 * Each phase sends at most once a week at a fixed hour, so a short fixed lookback
 * identifies this occasion exactly. The two phases carry different `type` values, so the
 * Saturday reminder and the Monday reveal cannot mask each other despite being two days
 * apart. Re-running a `force` send inside the window is intentionally suppressed.
 */
async function findAlreadyNotified(
  supabase: SupabaseClient,
  userIds: string[],
  type: string,
  now: Date
): Promise<Set<string>> {
  if (!userIds.length) return new Set()

  const since = new Date(now)
  since.setUTCDate(since.getUTCDate() - DEDUPE_LOOKBACK_DAYS)

  const { data, error } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('type', type)
    .in('user_id', userIds)
    .gte('created_at', since.toISOString())

  if (error) {
    // Fail closed: without proof the nudge has not gone out, do not risk a duplicate.
    console.error('[LEADERBOARD_NUDGE] dedupe lookup failed:', error.message)
    return new Set(userIds)
  }

  return new Set((data ?? []).map((row) => row.user_id as string))
}

async function deliver(
  supabase: SupabaseClient,
  orgId: string,
  userIds: string[],
  copy: NudgeCopy,
  type: string
): Promise<number> {
  const rows = userIds.map((userId) => ({
    user_id: userId,
    org_id: orgId,
    title: copy.title,
    message: copy.message,
    type,
    read: false,
    created_at: new Date().toISOString(),
  }))

  // Bell first: the in-app row is the durable record, push is best-effort on top.
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) throw new Error(`notification insert failed: ${error.message}`)

  try {
    await sendPushToUsers(supabase, orgId, userIds, {
      title: copy.title,
      body: copy.message,
      url: copy.url,
    })
  } catch (err) {
    console.error('[LEADERBOARD_NUDGE] push failed (non-fatal):', err)
  }

  return userIds.length
}

export async function runLeaderboardNudge(
  supabase: SupabaseClient,
  phase: NudgePhase,
  options?: { force?: boolean; now?: Date }
): Promise<LeaderboardNudgeResult> {
  const now = options?.now ?? new Date()
  const weekStart = getNudgeWeekStartKey(phase, now)
  const result: LeaderboardNudgeResult = {
    phase,
    inWindow: true,
    weekStart,
    orgs: 0,
    notified: 0,
    skippedNoResults: 0,
    skippedAlreadySent: 0,
    skippedNoRecipients: 0,
    errors: [],
  }

  if (!options?.force && !isNudgeWindow(phase, now)) {
    result.inWindow = false
    console.log('[LEADERBOARD_NUDGE] outside window', JSON.stringify(result))
    return result
  }

  const orgIds = await findEnabledOrgIds(supabase)
  result.orgs = orgIds.length
  if (!orgIds.length) {
    console.log('[LEADERBOARD_NUDGE]', JSON.stringify(result))
    return result
  }

  const copy = buildCopy(phase, weekStart)
  const type = NUDGE_NOTIFICATION_TYPES[phase]

  for (const orgId of orgIds) {
    try {
      const { data: entries, error: entriesError } = await supabase
        .from('weekly_leaderboard_entries')
        .select('jobs_completed, sales_amount')
        .eq('org_id', orgId)
        .eq('week_start', weekStart)

      if (entriesError) throw new Error(entriesError.message)

      const hasResults = (entries ?? []).some(
        (e) => Number(e.jobs_completed) > 0 || Number(e.sales_amount) > 0
      )

      // remind: only when the board is still empty. reveal: only when it is not.
      if (phase === 'remind' && hasResults) {
        result.skippedNoResults++
        continue
      }
      if (phase === 'reveal' && !hasResults) {
        result.skippedNoResults++
        continue
      }

      const wantedRoles =
        phase === 'remind' ? ['manager', 'platform_admin'] : ['employee']

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id')
        .eq('org_id', orgId)
        .in('role', wantedRoles)
        .or('is_hidden_test_profile.is.null,is_hidden_test_profile.eq.false')

      if (profilesError) throw new Error(profilesError.message)

      const candidates = (profiles ?? []).map((p) => p.id as string)
      if (!candidates.length) {
        result.skippedNoRecipients++
        continue
      }

      const alreadySent = await findAlreadyNotified(supabase, candidates, type, now)
      const recipients = candidates.filter((id) => !alreadySent.has(id))
      result.skippedAlreadySent += candidates.length - recipients.length

      if (!recipients.length) continue

      result.notified += await deliver(supabase, orgId, recipients, copy, type)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[LEADERBOARD_NUDGE] org failed', orgId, message)
      result.errors.push(`${orgId}: ${message}`)
    }
  }

  console.log('[LEADERBOARD_NUDGE]', JSON.stringify(result))
  return result
}
