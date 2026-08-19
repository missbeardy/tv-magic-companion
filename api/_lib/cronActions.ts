import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { loadLocalEnvIfNeeded } from './loadLocalEnv.js'
import { runContactFollowUpCron } from './runContactFollowUpCron.js'
import { runInvoiceChaseSweep } from './invoiceChase.js'
import { runQuoteChaseSweep } from './quoteChase.js'
import { runBookingReminderSweep } from './bookingReminder.js'
import { purgeOldWorkflowRuns } from './workflowRun.js'
import { purgeOldNotifications } from './notificationRetention.js'
import { purgeOldRateLimitHits } from './rateLimit.js'
import { runLeaderboardNudge } from './leaderboardNudge.js'
import type { NudgePhase } from '../../shared/leaderboardWeek.js'

export const CRON_KEYS = {
  contactFollowUp: 'contact_follow_up',
  automationSweeps: 'automation_sweeps',
  cronMaintenance: 'cron_maintenance',
  leaderboardNudge: 'leaderboard_nudge',
} as const

export function isCronAuthorized(req: VercelRequest): boolean {
  loadLocalEnvIfNeeded()
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false

  const authHeader = req.headers.authorization
  if (typeof authHeader === 'string' && authHeader === `Bearer ${secret}`) return true

  const cronHeader = req.headers['x-cron-secret']
  const headerVal = Array.isArray(cronHeader) ? cronHeader[0] : cronHeader
  return headerVal === secret
}

async function upsertHeartbeat(
  supabase: SupabaseClient,
  cronKey: string,
  lastResult: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('cron_heartbeats').upsert({
      cron_key: cronKey,
      last_run_at: new Date().toISOString(),
      last_result: lastResult,
    })
  } catch (heartbeatErr) {
    console.error('[CRON_HEARTBEAT_FAILED]', cronKey, heartbeatErr)
  }
}

async function withCronAuth(
  req: VercelRequest,
  res: VercelResponse,
  action: string,
  run: (supabase: SupabaseClient) => Promise<Record<string, unknown>>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ error: 'Server not configured' })
  }

  const started = Date.now()
  console.log(`[CRON ${action}] start`)
  try {
    const result = await run(supabase)
    const elapsedMs = Date.now() - started
    console.log(`[CRON ${action}] ok ${elapsedMs}ms`, JSON.stringify(result))
    return res.status(200).json({ ok: true, ...result, elapsedMs })
  } catch (err) {
    const elapsedMs = Date.now() - started
    console.error(`[CRON ${action}] failed ${elapsedMs}ms`, err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Cron failed',
      elapsedMs,
    })
  }
}

export async function handleContactFollowUpCron(req: VercelRequest, res: VercelResponse) {
  return withCronAuth(req, res, 'contact-follow-up', async (supabase) => {
    const result = await runContactFollowUpCron(supabase)
    await upsertHeartbeat(supabase, CRON_KEYS.contactFollowUp, { ...result })
    return { ...result }
  })
}

export async function handleAutomationSweepsCron(req: VercelRequest, res: VercelResponse) {
  return withCronAuth(req, res, 'automation-sweeps', async (supabase) => {
    const invoiceChase = await runInvoiceChaseSweep(supabase)
    const quoteChase = await runQuoteChaseSweep(supabase)
    const bookingReminder = await runBookingReminderSweep(supabase)
    const result = { invoiceChase, quoteChase, bookingReminder }
    await upsertHeartbeat(supabase, CRON_KEYS.automationSweeps, result)
    return result
  })
}

/**
 * Weekly leaderboard nudge. `phase` picks which half runs; `force=1` bypasses the
 * business-hour guard so the owner can fire a real send on demand during UAT without
 * waiting for Friday. Both are behind CRON_SECRET.
 */
export async function handleLeaderboardNudgeCron(req: VercelRequest, res: VercelResponse) {
  const rawPhase = Array.isArray(req.query.phase) ? req.query.phase[0] : req.query.phase
  const phase: NudgePhase = rawPhase === 'remind' ? 'remind' : 'reveal'
  const rawForce = Array.isArray(req.query.force) ? req.query.force[0] : req.query.force
  const force = rawForce === '1' || rawForce === 'true'

  return withCronAuth(req, res, `leaderboard-nudge:${phase}`, async (supabase) => {
    const result = await runLeaderboardNudge(supabase, phase, { force })
    // Only heartbeat a run that actually did work — an out-of-window tick is a no-op
    // and would otherwise overwrite the last real result.
    if (result.inWindow) {
      await upsertHeartbeat(supabase, CRON_KEYS.leaderboardNudge, { ...result })
    }
    return { ...result }
  })
}

export async function handleCronMaintenance(req: VercelRequest, res: VercelResponse) {
  return withCronAuth(req, res, 'cron-maintenance', async (supabase) => {
    const workflowPurge = await purgeOldWorkflowRuns(supabase)
    const notificationPurge = await purgeOldNotifications(supabase)
    const rateLimitPurge = await purgeOldRateLimitHits()
    const result = { workflowPurge, notificationPurge, rateLimitPurge }
    await upsertHeartbeat(supabase, CRON_KEYS.cronMaintenance, result)
    return result
  })
}
