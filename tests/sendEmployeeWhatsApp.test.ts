import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  formatWhatsAppAddress,
  getWhatsAppFromNumber,
  isEmployeeWhatsAppConfigured,
  sendEmployeeWhatsApp,
} from '../api/_lib/sendEmployeeWhatsApp'

describe('sendEmployeeWhatsApp', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    process.env.TWILIO_ACCOUNT_SID = 'ACtest'
    process.env.TWILIO_AUTH_TOKEN = 'token'
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886'
  })

  afterEach(() => {
    process.env = env
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('formats AU mobile as whatsapp E.164', () => {
    expect(formatWhatsAppAddress('0412 345 678')).toBe('whatsapp:+61412345678')
    expect(formatWhatsAppAddress('whatsapp:+61412345678')).toBe('whatsapp:+61412345678')
  })

  it('normalizes TWILIO_WHATSAPP_FROM with whatsapp prefix', () => {
    process.env.TWILIO_WHATSAPP_FROM = '+14155238886'
    expect(getWhatsAppFromNumber()).toBe('whatsapp:+14155238886')
  })

  it('fixes doubled or misspelled whatsapp prefix in TWILIO_WHATSAPP_FROM', () => {
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:whatspp+15559367913'
    expect(getWhatsAppFromNumber()).toBe('whatsapp:+15559367913')
    process.env.TWILIO_WHATSAPP_FROM = 'whatspp+15559367913'
    expect(getWhatsAppFromNumber()).toBe('whatsapp:+15559367913')
  })

  it('reports configured when Twilio WhatsApp env is set', () => {
    expect(isEmployeeWhatsAppConfigured()).toBe(true)
    delete process.env.TWILIO_WHATSAPP_FROM
    expect(isEmployeeWhatsAppConfigured()).toBe(false)
  })

  it('skips when WhatsApp is not configured', async () => {
    delete process.env.TWILIO_WHATSAPP_FROM
    const result = await sendEmployeeWhatsApp({ toPhone: '0412345678', body: 'Hello' })
    expect(result.sent).toBe(false)
    expect(result.skipped).toMatch(/not configured/i)
  })

  it('posts to Twilio Messages API with whatsapp addresses', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sid: 'SM123' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'delivered', sid: 'SM123' }) })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = sendEmployeeWhatsApp({
      toPhone: '0412 345 678',
      body: 'New lead assigned',
    })
    await vi.advanceTimersByTimeAsync(5000)
    const result = await resultPromise

    expect(result.sent).toBe(true)
    expect(result.sid).toBe('SM123')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/Accounts/ACtest/Messages.json')
    const body = init.body as string
    expect(body).toContain('To=whatsapp%3A%2B61412345678')
    expect(body).toContain('From=whatsapp%3A%2B14155238886')
    expect(body).toContain('Body=New+lead+assigned')

    const statusUrl = fetchMock.mock.calls[1][0] as string
    expect(statusUrl).toContain('/Accounts/ACtest/Messages/SM123.json')
  })

  it('retries without ContentVariables when Twilio returns 21656', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          code: 21656,
          message: 'The Content Variables parameter is invalid.',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sid: 'SMretry' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'delivered', sid: 'SMretry' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = sendEmployeeWhatsApp({
      toPhone: '0412 345 678',
      body: 'fallback',
      contentSid: 'HXstatic',
      contentVariables: { '1': 'FieldBourne', '2': 'Jane', '3': 'TV', '4': 'https://x' },
    })
    await vi.advanceTimersByTimeAsync(5000)
    const result = await resultPromise

    expect(result.sent).toBe(true)
    expect(result.sid).toBe('SMretry')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const retryBody = (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string
    expect(retryBody).toContain('ContentSid=HXstatic')
    expect(retryBody).not.toContain('ContentVariables')
  })

  it('treats a Twilio-accepted message that later fails delivery as not sent', async () => {
    // Simulates a Meta-suspended WhatsApp Business Account: Twilio accepts the
    // request (sid returned) but the message is rejected asynchronously.
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sid: 'SMghost' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'failed',
          error_code: 63024,
          error_message: 'Channel policy violation',
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = sendEmployeeWhatsApp({ toPhone: '0412 345 678', body: 'Hello' })
    await vi.advanceTimersByTimeAsync(5000)
    const result = await resultPromise

    expect(result.sent).toBe(false)
    expect(result.error).toMatch(/Channel policy violation/)
    expect(result.code).toBe(63024)
  })

  it('polls through non-terminal statuses until a terminal status is reached', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sid: 'SMslow' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'queued' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'sending' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'delivered', sid: 'SMslow' }) })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = sendEmployeeWhatsApp({ toPhone: '0412 345 678', body: 'Hello' })
    await vi.advanceTimersByTimeAsync(5000)
    const result = await resultPromise

    expect(result.sent).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
