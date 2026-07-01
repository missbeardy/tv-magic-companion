import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  sendEmployeeAlertWithSmsFallback,
  sendEmployeeSms,
} from '../api/_lib/sendEmployeeAlert'

describe('sendEmployeeAlert', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    process.env.TWILIO_ACCOUNT_SID = 'ACtest'
    process.env.TWILIO_AUTH_TOKEN = 'token'
    process.env.TWILIO_FROM_NUMBER = '+611300000000'
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886'
  })

  afterEach(() => {
    process.env = env
    vi.restoreAllMocks()
  })

  it('sends SMS when WhatsApp is not configured', async () => {
    delete process.env.TWILIO_WHATSAPP_FROM
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'SMsms' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendEmployeeAlertWithSmsFallback({
      toPhone: '0412 345 678',
      smsBody: 'New lead alert',
      whatsAppMessage: { body: 'New lead alert' },
    })

    expect(result.sent).toBe(true)
    expect(result.channel).toBe('sms')
    expect(result.sid).toBe('SMsms')
    expect(fetchMock).toHaveBeenCalledOnce()
    const body = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string
    expect(body).toContain('Body=New+lead+alert')
    expect(body).not.toContain('whatsapp')
  })

  it('uses WhatsApp when configured and does not send SMS', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'SMwa' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendEmployeeAlertWithSmsFallback({
      toPhone: '0412 345 678',
      smsBody: 'New lead alert',
      whatsAppMessage: { body: 'New lead alert' },
    })

    expect(result.sent).toBe(true)
    expect(result.channel).toBe('whatsapp')
    expect(fetchMock).toHaveBeenCalledOnce()
    const body = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string
    expect(body).toContain('whatsapp')
  })

  it('falls back to SMS when WhatsApp fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Template error', code: 63016 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sid: 'SMfallback' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendEmployeeAlertWithSmsFallback({
      toPhone: '0412 345 678',
      smsBody: 'Fallback body',
      whatsAppMessage: { body: 'Fallback body', contentSid: 'HXtest' },
    })

    expect(result.sent).toBe(true)
    expect(result.channel).toBe('sms')
    expect(result.sid).toBe('SMfallback')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('skips SMS when TWILIO_FROM_NUMBER missing', async () => {
    delete process.env.TWILIO_WHATSAPP_FROM
    delete process.env.TWILIO_FROM_NUMBER

    const result = await sendEmployeeSms('0412345678', 'Hello')
    expect(result.sent).toBe(false)
    expect(result.skipped).toMatch(/not configured/i)
  })
})
