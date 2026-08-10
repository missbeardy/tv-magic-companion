import { getSupabaseAdmin } from './supabaseAdmin.js'

export interface RateLimitParams {
  /** Namespaces the key so different endpoints never collide, e.g. 'anthropic', 'send-sms'. */
  scope: string
  /** Authenticated identity (orgId/userId) where one exists; otherwise the request IP. */
  identifier: string
  limit: number
  windowMs: number
}

/** Fixed-window bucket boundary for `nowMs`, as an ISO string — the primary-key column value. */
export function rateLimitWindowStart(nowMs: number, windowMs: number): string {
  return new Date(Math.floor(nowMs / windowMs) * windowMs).toISOString()
}

/**
 * Postgres-backed rate limiter (see supabase/migrations/20260806150000_rate_limits.sql).
 * Replaces module-scope `Map()` limiters, which are dishonest under serverless concurrency:
 * every concurrent Lambda instance gets its own Map, and every cold start wipes it, so the
 * effective limit was `limit x (however many instances Vercel spins up)` — unbounded under
 * exactly the burst traffic a limiter exists to stop.
 *
 * Fails open (allows the request) if the DB call itself errors, so a Supabase blip never takes
 * down the endpoint being protected — logged so it's visible in Sentry, not silent.
 */
export async function checkRateLimit(params: RateLimitParams): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return true

  const windowStart = rateLimitWindowStart(Date.now(), params.windowMs)
  const key = `${params.scope}:${params.identifier}`.slice(0, 250)

  const { data, error } = await supabase.rpc('increment_rate_limit', {
    p_key: key,
    p_window_start: windowStart,
  })

  if (error) {
    console.error('Rate limit check failed (failing open):', error.message)
    return true
  }

  return (data as number) <= params.limit
}

/** Resolves the identifier for an authenticated route: orgId+userId if present, else the IP.
 * `x-forwarded-for` is client-controllable behind some proxies — prefer the authenticated
 * identity where one exists. */
export function rateLimitIdentifier(ip: string | undefined, authIdentity?: string): string {
  if (authIdentity) return authIdentity
  if (!ip) return 'unknown'
  return ip.split(',')[0]?.trim().slice(0, 100) || 'unknown'
}

/** Cron sweep step — call from the existing consolidated sweep chain, not a new endpoint. */
export async function purgeOldRateLimitHits(
  hoursOld = 2
): Promise<{ deleted: number }> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { deleted: 0 }

  const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('rate_limit_hits')
    .delete()
    .lt('window_start', cutoff)
    .select('key')

  if (error) {
    console.error('[RATE_LIMIT_PURGE_FAILED]', error.message)
    throw error
  }

  return { deleted: data?.length ?? 0 }
}
