import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { captureUnroutedInbound } from '../api/_lib/captureUnroutedInbound'

vi.mock('../api/_lib/sendEmployeeAlert.js', () => ({
  sendEmployeeAlertToPhone: vi.fn(),
}))

import { sendEmployeeAlertToPhone } from '../api/_lib/sendEmployeeAlert'

const mockSendAlert = vi.mocked(sendEmployeeAlertToPhone)

function mockSupabase(insertResult: { error: { message: string } | null }) {
  const insert = vi.fn().mockResolvedValue(insertResult)
  return {
    from: vi.fn().mockReturnValue({ insert }),
    _insert: insert,
  } as unknown as import('@supabase/supabase-js').SupabaseClient & { _insert: ReturnType<typeof vi.fn> }
}

describe('captureUnroutedInbound', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    vi.clearAllMocks()
    mockSendAlert.mockResolvedValue({ sent: true, channel: 'sms', sid: 'SMtest' })
  })

  afterEach(() => {
    process.env = env
    vi.restoreAllMocks()
  })

  it('inserts row and attempts alert when PLATFORM_ALERT_PHONE is set', async () => {
    process.env.PLATFORM_ALERT_PHONE = '+61400111222'
    const supabase = mockSupabase({ error: null })

    await captureUnroutedInbound(supabase, {
      channel: 'sms',
      identifier: '+61499999999',
      reason: 'no_mapping',
      payload: { Body: 'test', From: '+61400000000' },
    })

    expect(supabase._insert).toHaveBeenCalledWith({
      channel: 'sms',
      identifier: '+61499999999',
      reason: 'no_mapping',
      payload: { Body: 'test', From: '+61400000000' },
    })
    expect(mockSendAlert).toHaveBeenCalledWith(
      '+61400111222',
      'Unrouted inbound sms — +61499999999 (no_mapping). Captured for review.',
      { body: 'Unrouted inbound sms — +61499999999 (no_mapping). Captured for review.' }
    )
  })

  it('skips alert when PLATFORM_ALERT_PHONE is unset', async () => {
    delete process.env.PLATFORM_ALERT_PHONE
    const supabase = mockSupabase({ error: null })

    await captureUnroutedInbound(supabase, {
      channel: 'email',
      identifier: null,
      reason: 'no_tag',
      payload: { envelope: { to: 'base@cloudmailin.net' } },
    })

    expect(supabase._insert).toHaveBeenCalled()
    expect(mockSendAlert).not.toHaveBeenCalled()
  })

  it('does not throw when insert fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = mockSupabase({ error: { message: 'db down' } })

    await expect(
      captureUnroutedInbound(supabase, {
        channel: 'call',
        identifier: '+61280000000',
        reason: 'no_mapping',
        payload: { calledNumber: '+61280000000' },
      })
    ).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[UNROUTED_CAPTURE_FAILED]',
      expect.objectContaining({
        channel: 'call',
        identifier: '+61280000000',
        reason: 'no_mapping',
        error: 'db down',
      })
    )
    expect(mockSendAlert).not.toHaveBeenCalled()
  })
})
