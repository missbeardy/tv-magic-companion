import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../api/_lib/resolveOrgFromDid.js', () => ({ resolveOrgIdFromDid: vi.fn() }))
vi.mock('../api/_lib/captureUnroutedInbound.js', () => ({ captureUnroutedInbound: vi.fn() }))
vi.mock('../api/_lib/featureSwitches.js', () => ({ isFeatureEnabledForOrg: vi.fn() }))
vi.mock('../api/_lib/processVoicemail.js', () => ({ processVoicemail: vi.fn() }))

import { handleForwardedCall, type ForwardedCallEvent } from '../api/_lib/forwardedCall'
import { resolveOrgIdFromDid } from '../api/_lib/resolveOrgFromDid'
import { captureUnroutedInbound } from '../api/_lib/captureUnroutedInbound'
import { isFeatureEnabledForOrg } from '../api/_lib/featureSwitches'
import { processVoicemail } from '../api/_lib/processVoicemail'

const mockResolve = vi.mocked(resolveOrgIdFromDid)
const mockCapture = vi.mocked(captureUnroutedInbound)
const mockSwitch = vi.mocked(isFeatureEnabledForOrg)
const mockProcess = vi.mocked(processVoicemail)

const supabase = {} as import('@supabase/supabase-js').SupabaseClient
const audio = { buffer: Buffer.from('RIFF'), fileName: 'vm.wav', contentType: 'audio/wav' }

function event(overrides: Partial<ForwardedCallEvent> = {}): ForwardedCallEvent {
  return {
    provider: 'crazytel',
    dedupKey: 'crazytel:evt-1',
    calledNumber: '+61731234567',
    callerPhone: '+61412345678',
    receivedAt: '2026-10-01T01:02:03Z',
    durationSec: 41,
    audio: { fetch: vi.fn().mockResolvedValue(audio) },
    noMessage: false,
    ...overrides,
  }
}

describe('handleForwardedCall', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolve.mockResolvedValue({ orgId: 'org-fbd', source: 'phone_mapping' })
    mockSwitch.mockResolvedValue(true)
    mockProcess.mockResolvedValue({ outcome: 'created', leadId: 'lead-1', transcriptionFailed: false })
  })

  it('routes by the answering line and runs the shared voicemail pipeline', async () => {
    const result = await handleForwardedCall(supabase, event())

    expect(mockResolve).toHaveBeenCalledWith(supabase, '+61731234567')
    expect(mockSwitch).toHaveBeenCalledWith('org-fbd', 'inbound_calls')
    expect(result).toMatchObject({ outcome: 'processed', orgId: 'org-fbd', audioStored: true })
    expect(mockProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-fbd',
        source: 'call_forward',
        dedupKey: 'crazytel:evt-1',
        audio,
        noMessage: false,
        metadata: expect.objectContaining({ phone: '+61412345678', duration: '41' }),
      })
    )
  })

  it('captures an unmapped line instead of guessing an org', async () => {
    mockResolve.mockResolvedValue({ orgId: null, source: 'unresolved' })

    const result = await handleForwardedCall(supabase, event())

    expect(result).toEqual({ outcome: 'unrouted' })
    expect(mockCapture).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ channel: 'call', identifier: '+61731234567', reason: 'no_mapping' })
    )
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('does nothing when inbound_calls is off for the org', async () => {
    mockSwitch.mockResolvedValue(false)
    const e = event()

    const result = await handleForwardedCall(supabase, e)

    expect(result).toEqual({ outcome: 'disabled', orgId: 'org-fbd' })
    expect(e.audio!.fetch).not.toHaveBeenCalled()
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('marks a withheld caller as Unknown', async () => {
    await handleForwardedCall(supabase, event({ callerPhone: null }))
    expect(mockProcess.mock.calls[0][0].metadata?.phone).toBe('Unknown')
  })

  it('keeps the lead when the audio download fails', async () => {
    const result = await handleForwardedCall(
      supabase,
      event({ audio: { fetch: vi.fn().mockRejectedValue(new Error('403')) } })
    )

    expect(result).toMatchObject({ outcome: 'processed', audioStored: false })
    expect(mockProcess.mock.calls[0][0].audio).toBeNull()
  })

  it('never fetches audio for a hang-up', async () => {
    const e = event({ noMessage: true })
    await handleForwardedCall(supabase, e)

    expect(e.audio!.fetch).not.toHaveBeenCalled()
    expect(mockProcess.mock.calls[0][0]).toMatchObject({ noMessage: true, audio: null })
  })
})
