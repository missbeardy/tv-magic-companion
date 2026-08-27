import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { computeTwilioSignature } from './twilioSignature.js'
import { getPlatformUrl } from './platformUrl.js'
import { sendEmployeeAlertToPhone } from './sendEmployeeAlert.js'
import { captureServerException } from './sentry.js'

/**
 * Synthetic inbound probe.
 *
 * Written 27-08-2026, the day after v1.1.184 acked Twilio before running the pipeline and
 * Vercel froze the invocation the instant the response was flushed. Every layer reported
 * success — Twilio logged a clean 200, the endpoint was up, the repo matched production,
 * typecheck and tests passed — and no lead was created for a day. `audit-prod-config.mjs`
 * could not have caught it: nothing was misconfigured.
 *
 * The only witness was the absence of rows. So this probe asserts the absence is gone:
 * it POSTs a real, signature-valid Twilio webhook over HTTP to the deployed endpoint and
 * then waits for a row to appear that only the *post-response* half of that handler could
 * have written. An in-process call would prove nothing here — the whole failure lives in
 * what happens after the response is flushed, which only a real HTTP request exercises.
 *
 * The echo lands in `cron_heartbeats` rather than creating a real lead: an hourly probe
 * that ran the full pipeline would auto-assign a technician, notify the managers and fire
 * an ack SMS to a fake number, every hour, forever. See `INBOUND_PROBE_COVERAGE` below for
 * what that trade costs.
 */

/** Body prefix that marks a request as the probe rather than a customer enquiry. */
export const INBOUND_PROBE_MARKER = '[INBOUND-PROBE]'

/** `cron_heartbeats.cron_key` the webhook echoes into, and the cron then polls for. */
export const INBOUND_PROBE_ECHO_KEY = 'inbound_probe_echo'

/**
 * What this probe does and does not prove, kept next to the code so it cannot quietly
 * drift into being trusted for more than it checks.
 *
 * Covers: DNS/TLS/routing to the deployed function, the raw-body read, the rate limiter,
 * Twilio signature verification against the live TWILIO_AUTH_TOKEN, and — the point of the
 * exercise — that work scheduled after the response is flushed actually runs and reaches
 * Supabase.
 *
 * Does not cover: org resolution, feature switches, Claude extraction, lead insertion,
 * assignment or notifications. Those have unit tests and, unlike the freeze, they fail
 * loudly. A probe that covered them would need its own org and brand so its notifications
 * had nowhere real to land.
 */
export const INBOUND_PROBE_COVERAGE =
  'HTTP → signature → post-response continuation → Supabase write'

export interface InboundProbeMatch {
  nonce: string
}

/** Recognize a probe request. Returns its nonce, or null for a real enquiry. */
export function matchInboundProbe(smsText: string): InboundProbeMatch | null {
  const trimmed = smsText.trim()
  if (!trimmed.startsWith(INBOUND_PROBE_MARKER)) return null
  const nonce = trimmed.slice(INBOUND_PROBE_MARKER.length).trim()
  if (!nonce) return null
  return { nonce }
}

/**
 * The webhook side: record that the post-response continuation reached the database.
 *
 * Deliberately the smallest possible write. If this row appears, the half of the handler
 * that v1.1.184 silently killed is alive.
 */
export async function recordInboundProbeEcho(
  supabase: SupabaseClient,
  nonce: string
): Promise<void> {
  const { error } = await supabase.from('cron_heartbeats').upsert({
    cron_key: INBOUND_PROBE_ECHO_KEY,
    last_run_at: new Date().toISOString(),
    last_result: { nonce, at: new Date().toISOString() },
  })
  if (error) {
    console.error('[INBOUND_PROBE_ECHO_FAILED]', error.message)
    return
  }
  console.log(`[INBOUND_PROBE_ECHO] ${nonce}`)
}

export interface InboundProbeResult {
  ok: boolean
  skipped?: string
  /** HTTP status the webhook returned — 200 even when the continuation is dead. */
  postStatus?: number
  /** Time from POST to the echo row appearing. */
  echoMs?: number
  failure?: string
  alerted?: boolean
}

const ECHO_TIMEOUT_MS = 20_000
const ECHO_POLL_MS = 500

async function readEchoNonce(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('cron_heartbeats')
    .select('last_result')
    .eq('cron_key', INBOUND_PROBE_ECHO_KEY)
    .maybeSingle()
  const result = data?.last_result as { nonce?: string } | null | undefined
  return result?.nonce ?? null
}

/** The DID to address the probe at — a real mapped number, so the request looks real. */
async function resolveProbeDid(supabase: SupabaseClient): Promise<string | null> {
  const configured = process.env.INBOUND_PROBE_DID?.trim()
  if (configured) return configured

  const { data } = await supabase
    .from('org_phone_numbers')
    .select('phone_number')
    .order('phone_number', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data?.phone_number as string | undefined)?.trim() || null
}

/**
 * Alert only on the transition into failure, not on every tick of an ongoing outage —
 * an hourly SMS for three days is how an alert channel gets muted, and a muted channel
 * is the state this whole probe exists to prevent.
 */
async function alertOnTransition(
  supabase: SupabaseClient,
  failure: string,
  previousOk: boolean
): Promise<boolean> {
  if (!previousOk) return false

  const alertPhone = process.env.PLATFORM_ALERT_PHONE?.trim()
  if (!alertPhone) return false

  const body = `Inbound SMS probe FAILED: ${failure}. Inbound leads are probably not being saved.`
  try {
    const result = await sendEmployeeAlertToPhone(alertPhone, body, { body })
    return result.sent === true
  } catch (err) {
    console.error('[INBOUND_PROBE_ALERT_FAILED]', err)
    return false
  }
}

/**
 * The cron side: fire a signed webhook at the deployed endpoint and require the echo.
 *
 * `previousOk` is the last run's verdict, used to make alerting edge-triggered.
 */
export async function runInboundProbe(
  supabase: SupabaseClient,
  previousOk: boolean,
  options: { echoTimeoutMs?: number; echoPollMs?: number } = {}
): Promise<InboundProbeResult> {
  const echoTimeoutMs = options.echoTimeoutMs ?? ECHO_TIMEOUT_MS
  const echoPollMs = options.echoPollMs ?? ECHO_POLL_MS

  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  if (!authToken) return { ok: true, skipped: 'no_twilio_auth_token' }

  // Note this must be the host Twilio itself dials: the signature is computed over the
  // URL, and the handler reconstructs it from the Host header it receives. PLATFORM_URL is
  // set in production, so getPlatformUrl() does not fall through to the per-deployment
  // VERCEL_URL, which would sign a URL the alias never sees.
  const platformUrl = getPlatformUrl()

  const did = await resolveProbeDid(supabase)
  if (!did) return { ok: true, skipped: 'no_mapped_did' }

  const nonce = randomUUID()
  const params: Record<string, string> = {
    Body: `${INBOUND_PROBE_MARKER} ${nonce}`,
    From: '+61400000009',
    To: did,
  }

  const webhookUrl = `${platformUrl.replace(/\/$/, '')}/api/inbound-sms`
  const signature = computeTwilioSignature(webhookUrl, params, authToken)

  const started = Date.now()
  let postStatus: number
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': signature,
      },
      body: new URLSearchParams(params).toString(),
    })
    postStatus = res.status
    await res.text()
  } catch (err) {
    const failure = `webhook unreachable: ${err instanceof Error ? err.message : String(err)}`
    captureServerException(err, { probe: 'inbound-sms' })
    return {
      ok: false,
      failure,
      alerted: await alertOnTransition(supabase, failure, previousOk),
    }
  }

  if (postStatus !== 200) {
    const failure = `webhook returned ${postStatus}`
    return {
      ok: false,
      postStatus,
      failure,
      alerted: await alertOnTransition(supabase, failure, previousOk),
    }
  }

  // The 200 above is exactly what the outage looked like. Everything that matters is
  // whether the echo lands.
  while (Date.now() - started < echoTimeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, echoPollMs))
    if ((await readEchoNonce(supabase)) === nonce) {
      return { ok: true, postStatus, echoMs: Date.now() - started }
    }
  }

  const failure = `webhook answered 200 but no echo within ${echoTimeoutMs}ms — the post-response continuation is not running`
  console.error('[INBOUND_PROBE_FAILED]', failure)
  captureServerException(new Error(`Inbound SMS probe: ${failure}`), { probe: 'inbound-sms' })
  return {
    ok: false,
    postStatus,
    failure,
    alerted: await alertOnTransition(supabase, failure, previousOk),
  }
}
