import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPlatformSms, sendTwilioSms } from '../api/_lib/twilioSend'
import { getSupabaseAdmin } from '../api/_lib/supabaseAdmin'
import { isPhoneOptedOut } from '../api/_lib/smsOptOut'

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('../api/_lib/smsOptOut.js', () => ({
  isPhoneOptedOut: vi.fn(),
}))

const mockAdmin = vi.mocked(getSupabaseAdmin)
const mockOptedOut = vi.mocked(isPhoneOptedOut)

describe('sendTwilioSms', () => {
  const env = process.env

  beforeEach(() => {
    process.env = {
      ...env,
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+611300000000',
    }
    vi.stubGlobal('fetch', vi.fn())
    mockOptedOut.mockResolvedValue(false)
  })

  it('skips when the org has no sender number', async () => {
    mockAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { sms_from_number: null }, error: null }),
          }),
        }),
      }),
    } as never)

    const result = await sendTwilioSms({ orgId: 'org-a', to: '0412345678', body: 'Hi' })
    expect(result).toEqual({ sent: false, skipped: 'no_sender_number' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not fall back to TWILIO_FROM_NUMBER', async () => {
    mockAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { sms_from_number: '  ' }, error: null }),
          }),
        }),
      }),
    } as never)

    const result = await sendTwilioSms({ orgId: 'org-a', to: '0412345678', body: 'Hi' })
    expect(result.skipped).toBe('no_sender_number')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts from the org sender', async () => {
    mockAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { sms_from_number: '+61468050366' }, error: null }),
          }),
        }),
      }),
    } as never)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'SMorg' }),
    } as Response)

    const result = await sendTwilioSms({ orgId: 'org-a', to: '0412345678', body: 'Hi there' })
    expect(result).toEqual({ sent: true, sid: 'SMorg' })
    const body = (vi.mocked(fetch).mock.calls[0] as [string, RequestInit])[1].body as string
    expect(body).toContain('From=%2B61468050366')
    expect(body).not.toContain('From=%2B611300000000')
  })

  it('skips opted-out destinations', async () => {
    mockAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { sms_from_number: '+61468050366' }, error: null }),
          }),
        }),
      }),
    } as never)
    mockOptedOut.mockResolvedValue(true)

    const result = await sendTwilioSms({ orgId: 'org-a', to: '0412345678', body: 'Hi' })
    expect(result).toEqual({ sent: false, skipped: 'opted_out' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('sendPlatformSms', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'token' }
    vi.stubGlobal('fetch', vi.fn())
  })

  it('uses TWILIO_FROM_NUMBER', async () => {
    process.env.TWILIO_FROM_NUMBER = '+611300000000'
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'SMplat' }),
    } as Response)

    const result = await sendPlatformSms({ to: '0412345678', body: 'Alert' })
    expect(result.sent).toBe(true)
    const body = (vi.mocked(fetch).mock.calls[0] as [string, RequestInit])[1].body as string
    expect(body).toContain('From=%2B611300000000')
  })
})
