import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  INBOUND_PROBE_ECHO_KEY,
  INBOUND_PROBE_MARKER,
  matchInboundProbe,
  recordInboundProbeEcho,
  runInboundProbe,
} from '../api/_lib/inboundProbe'

vi.mock('../api/_lib/sendEmployeeAlert.js', () => ({
  sendEmployeeAlertToPhone: vi.fn(),
}))
vi.mock('../api/_lib/sentry.js', () => ({
  captureServerException: vi.fn(),
}))

import { sendEmployeeAlertToPhone } from '../api/_lib/sendEmployeeAlert'

const mockSendAlert = vi.mocked(sendEmployeeAlertToPhone)

type SupabaseLike = import('@supabase/supabase-js').SupabaseClient

/**
 * Minimal Supabase double: one mapped DID, and an echo row that only appears once
 * `echoNonce` is set — which is how a live handler's post-response write is simulated.
 */
function mockSupabase(options: { did?: string | null; echoNonce?: () => string | null } = {}) {
  const { did = '+61468050366', echoNonce = () => null } = options
  const upsert = vi.fn().mockResolvedValue({ error: null })

  const from = vi.fn((table: string) => {
    if (table === 'org_phone_numbers') {
      return {
        select: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: did ? { phone_number: did } : null }),
            }),
          }),
        }),
      }
    }
    if (table === 'cron_heartbeats') {
      return {
        upsert,
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              const nonce = echoNonce()
              return { data: nonce ? { last_result: { nonce } } : null }
            },
          }),
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  return { from, _upsert: upsert } as unknown as SupabaseLike & {
    _upsert: ReturnType<typeof vi.fn>
  }
}

/** Capture the Body param the probe posts, so the test can echo its nonce back. */
function stubFetch(status: number): { bodyOf: () => string } {
  let sent = ''
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      sent = init.body
      return { status, text: async () => '<Response></Response>' }
    })
  )
  return { bodyOf: () => sent }
}

function nonceFromBody(body: string): string {
  const params = new URLSearchParams(body)
  return params.get('Body')!.replace(INBOUND_PROBE_MARKER, '').trim()
}

describe('matchInboundProbe', () => {
  it('recognizes a probe and returns its nonce', () => {
    expect(matchInboundProbe(`${INBOUND_PROBE_MARKER} abc-123`)).toEqual({ nonce: 'abc-123' })
  })

  it('ignores a real enquiry', () => {
    expect(matchInboundProbe('Need my TV mounted in Seven Hills')).toBeNull()
  })

  it('ignores the marker without a nonce, so a customer cannot trigger the probe path', () => {
    expect(matchInboundProbe(INBOUND_PROBE_MARKER)).toBeNull()
    expect(matchInboundProbe(`prefix ${INBOUND_PROBE_MARKER} abc`)).toBeNull()
  })
})

describe('recordInboundProbeEcho', () => {
  it('writes the nonce to the echo heartbeat', async () => {
    const supabase = mockSupabase()
    await recordInboundProbeEcho(supabase, 'nonce-1')

    expect(supabase._upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        cron_key: INBOUND_PROBE_ECHO_KEY,
        last_result: expect.objectContaining({ nonce: 'nonce-1' }),
      })
    )
  })
})

describe('runInboundProbe', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    process.env.TWILIO_AUTH_TOKEN = 'test-token'
    process.env.PLATFORM_URL = 'https://example.test'
    delete process.env.PLATFORM_ALERT_PHONE
    delete process.env.INBOUND_PROBE_DID
    vi.clearAllMocks()
    mockSendAlert.mockResolvedValue({ sent: true, channel: 'sms', sid: 'SMtest' })
  })

  afterEach(() => {
    process.env = env
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('passes when the echo lands', async () => {
    const fetchStub = stubFetch(200)
    const supabase = mockSupabase({
      echoNonce: () => (fetchStub.bodyOf() ? nonceFromBody(fetchStub.bodyOf()) : null),
    })

    const result = await runInboundProbe(supabase, true)

    expect(result.ok).toBe(true)
    expect(result.postStatus).toBe(200)
    expect(mockSendAlert).not.toHaveBeenCalled()
  })

  it('fails on a 200 with no echo — the 26-08 outage exactly', async () => {
    stubFetch(200)
    const supabase = mockSupabase({ echoNonce: () => null })
    process.env.PLATFORM_ALERT_PHONE = '+61400111222'

    const result = await runInboundProbe(supabase, true, { echoTimeoutMs: 60, echoPollMs: 10 })

    expect(result.ok).toBe(false)
    expect(result.postStatus).toBe(200)
    expect(result.failure).toContain('no echo')
    expect(result.alerted).toBe(true)
  })

  it('does not re-alert while the outage continues', async () => {
    stubFetch(200)
    const supabase = mockSupabase({ echoNonce: () => null })
    process.env.PLATFORM_ALERT_PHONE = '+61400111222'

    const result = await runInboundProbe(supabase, false, { echoTimeoutMs: 60, echoPollMs: 10 })

    expect(result.ok).toBe(false)
    expect(result.alerted).toBe(false)
    expect(mockSendAlert).not.toHaveBeenCalled()
  })

  it('reports a non-200 without waiting for an echo', async () => {
    stubFetch(502)
    const supabase = mockSupabase({ echoNonce: () => null })

    const result = await runInboundProbe(supabase, true, { echoTimeoutMs: 60, echoPollMs: 10 })

    expect(result.ok).toBe(false)
    expect(result.postStatus).toBe(502)
    expect(result.failure).toContain('502')
  })

  it('skips rather than fails when the deployment has no Twilio token', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    const supabase = mockSupabase()

    const result = await runInboundProbe(supabase, true)

    expect(result).toEqual({ ok: true, skipped: 'no_twilio_auth_token' })
  })

  it('skips when no DID is mapped, so a fresh environment is not a false alarm', async () => {
    const supabase = mockSupabase({ did: null })

    const result = await runInboundProbe(supabase, true)

    expect(result).toEqual({ ok: true, skipped: 'no_mapped_did' })
  })
})
