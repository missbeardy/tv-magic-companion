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
  })

  it('formats AU mobile as whatsapp E.164', () => {
    expect(formatWhatsAppAddress('0412 345 678')).toBe('whatsapp:+61412345678')
    expect(formatWhatsAppAddress('whatsapp:+61412345678')).toBe('whatsapp:+61412345678')
  })

  it('normalizes TWILIO_WHATSAPP_FROM with whatsapp prefix', () => {
    process.env.TWILIO_WHATSAPP_FROM = '+14155238886'
    expect(getWhatsAppFromNumber()).toBe('whatsapp:+14155238886')
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'SM123' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendEmployeeWhatsApp({
      toPhone: '0412 345 678',
      body: 'New lead assigned',
    })

    expect(result.sent).toBe(true)
    expect(result.sid).toBe('SM123')
    expect(fetchMock).toHaveBeenCalledOnce()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/Accounts/ACtest/Messages.json')
    const body = init.body as string
    expect(body).toContain('To=whatsapp%3A%2B61412345678')
    expect(body).toContain('From=whatsapp%3A%2B14155238886')
    expect(body).toContain('Body=New+lead+assigned')
  })
})
