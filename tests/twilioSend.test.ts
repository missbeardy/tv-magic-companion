import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isTwilioConfigured, postTwilioSms, sendPlatformSms } from '../api/_lib/twilioSend'

// Org SMS (sender lookup, opt-out, provider dispatch) is covered in smsSend.test.ts.

describe('postTwilioSms', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'token' }
    vi.stubGlobal('fetch', vi.fn())
  })

  it('posts form-encoded From/To/Body with Basic auth', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'SMorg' }),
    } as Response)

    const result = await postTwilioSms('+61468050366', '+61412345678', 'Hi there')
    expect(result).toEqual({ sent: true, sid: 'SMorg' })
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('ACtest:token').toString('base64')}`
    )
    expect(init.body).toContain('From=%2B61468050366')
    expect(init.body).toContain('To=%2B61412345678')
  })

  it('reports a Twilio rejection as not sent', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Invalid To' }),
    } as Response)

    const result = await postTwilioSms('+61468050366', '+61412345678', 'Hi')
    expect(result).toEqual({ sent: false, error: 'Invalid To' })
  })

  it('skips without credentials', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    expect(isTwilioConfigured()).toBe(false)
    const result = await postTwilioSms('+61468050366', '+61412345678', 'Hi')
    expect(result.skipped).toBe('Twilio not configured')
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
