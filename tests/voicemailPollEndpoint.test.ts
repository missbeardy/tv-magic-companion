import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../api/_lib/featureSwitches.js', () => ({
  isFeatureEnabledForOrg: vi.fn(),
}))
vi.mock('../api/_lib/voicemailMailbox.js', () => ({
  getVoicemailMailboxConfig: vi.fn(),
  pollVoicemailMailbox: vi.fn(),
}))
vi.mock('../api/_lib/processVoicemail.js', () => ({
  processVoicemail: vi.fn(),
}))

import { handleVoicemailPoll } from '../api/_lib/handleVoicemailPoll'
import { isFeatureEnabledForOrg } from '../api/_lib/featureSwitches'
import { getVoicemailMailboxConfig, pollVoicemailMailbox } from '../api/_lib/voicemailMailbox'

const mockFeature = vi.mocked(isFeatureEnabledForOrg)
const mockConfig = vi.mocked(getVoicemailMailboxConfig)
const mockPoll = vi.mocked(pollVoicemailMailbox)

const ORG_ID = '11111111-1111-1111-1111-111111111111'
const supabase = {} as import('@supabase/supabase-js').SupabaseClient

function createRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
  }
  return res as unknown as VercelResponse & { statusCode: number; body: unknown }
}

function createReq(authorization?: string): VercelRequest {
  return {
    method: 'POST',
    headers: authorization ? { authorization } : {},
    query: { action: 'voicemail-poll' },
  } as unknown as VercelRequest
}

describe('handleVoicemailPoll', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, CRON_SECRET: 'test-secret', VOICEMAIL_MAILBOX_ORG_ID: ORG_ID }
    vi.clearAllMocks()
    mockFeature.mockResolvedValue(true)
    mockConfig.mockReturnValue({
      host: 'imap.gmail.com',
      user: 'ops@example.com',
      password: 'app-password',
      folder: 'Voicemail',
    })
    mockPoll.mockResolvedValue({ examined: 1, processed: 1, skipped: 0, failed: 0 })
  })

  afterEach(() => {
    process.env = env
  })

  it('rejects a request without the cron secret', async () => {
    const res = createRes()
    await handleVoicemailPoll(createReq(), res, supabase)

    expect(res.statusCode).toBe(401)
    expect(mockPoll).not.toHaveBeenCalled()
  })

  it('rejects a wrong secret', async () => {
    const res = createRes()
    await handleVoicemailPoll(createReq('Bearer nope'), res, supabase)

    expect(res.statusCode).toBe(401)
    expect(mockPoll).not.toHaveBeenCalled()
  })

  it('refuses to guess an org when VOICEMAIL_MAILBOX_ORG_ID is unset', async () => {
    delete process.env.VOICEMAIL_MAILBOX_ORG_ID
    const res = createRes()

    await handleVoicemailPoll(createReq('Bearer test-secret'), res, supabase)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ skipped: true, reason: 'not_configured' })
    expect(mockPoll).not.toHaveBeenCalled()
  })

  it('stays off when the mailbox credentials are absent', async () => {
    mockConfig.mockReturnValue(null)
    const res = createRes()

    await handleVoicemailPoll(createReq('Bearer test-secret'), res, supabase)

    expect(res.body).toEqual({ skipped: true, reason: 'not_configured' })
    expect(mockPoll).not.toHaveBeenCalled()
  })

  it('honours the inbound_calls switch, same as the CloudMailin path', async () => {
    mockFeature.mockResolvedValue(false)
    const res = createRes()

    await handleVoicemailPoll(createReq('Bearer test-secret'), res, supabase)

    expect(mockFeature).toHaveBeenCalledWith(ORG_ID, 'inbound_calls')
    expect(res.body).toEqual({ skipped: true, reason: 'inbound_calls_disabled' })
    expect(mockPoll).not.toHaveBeenCalled()
  })

  it('polls a bounded batch and reports the summary', async () => {
    const res = createRes()

    await handleVoicemailPoll(createReq('Bearer test-secret'), res, supabase)

    expect(mockPoll).toHaveBeenCalledTimes(1)
    // Batch stays small: each message is IMAP + Whisper + lead insert inside 60s.
    expect(mockPoll.mock.calls[0][0]).toBe(2)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ success: true, processed: 1 })
  })

  it('rejects non-POST requests', async () => {
    const res = createRes()
    const req = { ...createReq('Bearer test-secret'), method: 'GET' } as VercelRequest

    await handleVoicemailPoll(req, res, supabase)
    expect(res.statusCode).toBe(405)
  })
})
