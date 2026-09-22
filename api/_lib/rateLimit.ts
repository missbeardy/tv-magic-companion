import { getSupabaseAdmin } from './supabaseAdmin.js'

export interface RateLimitParams {
  /** Namespaces the key so different endpoints never collide, e.g. 'anthropic', 'send-sms'. */
  scope: string
  /** Authenticated identity (orgId/userId) where one exists; otherwise the request IP. */
  identifier: string
  limit: number
  windowMs: number
  /**
   * Deny the request instead of allowing it when the limiter itself can't be reached
   * (no Supabase client, or the RPC errors). Default false (fail open) is right for
   * most authenticated/internal endpoints — a DB blip shouldn't take down the app.
   * Set true for public, unauthenticated, spend-triggering endpoints (campaign quote,
   * public quote/invoice actions) where "the limiter is down" and "let anything
   * through" is the worse failure mode.
   */
  failClosed?: boolean
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
  if (!supabase) return !params.failClosed

  const windowStart = rateLimitWindowStart(Date.now(), params.windowMs)
  const key = `${params.scope}:${params.identifier}`.slice(0, 250)

  const { data, error } = await supabase.rpc('increment_rate_limit', {
    p_key: key,
    p_window_start: windowStart,
  })

  if (error) {
    console.error(
      `Rate limit check failed (failing ${params.failClosed ? 'closed' : 'open'}):`,
      error.message
    )
    return !params.failClosed
  }

  return (data as number) <= params.limit
}

export interface RateLimitHeaders {
  'x-real-ip'?: string | string[]
  'x-vercel-forwarded-for'?: string | string[]
  'x-forwarded-for'?: string | string[]
  [header: string]: string | string[] | undefined
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Resolves the identifier for a route: orgId+userId if present, else the request IP.
 * `x-forwarded-for` is client-controllable behind some proxies and can carry a chain of
 * hops; prefer Vercel's own edge-set headers (`x-real-ip`, then `x-vercel-forwarded-for`)
 * which aren't attacker-settable on Vercel's infra, falling back to `x-forwarded-for` for
 * local dev / non-Vercel environments where those aren't set.
 */
export function rateLimitIdentifier(headers: RateLimitHeaders, authIdentity?: string): string {
  if (authIdentity) return authIdentity
  const ip =
    firstHeaderValue(headers['x-real-ip']) ??
    firstHeaderValue(headers['x-vercel-forwarded-for']) ??
    firstHeaderValue(headers['x-forwarded-for'])
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
