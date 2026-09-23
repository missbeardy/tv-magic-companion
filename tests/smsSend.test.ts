import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isOrgSmsReady,
  loadOrgSmsConfig,
  parseSmsProvider,
  sendOrgSms,
} from '../api/_lib/smsSend'
import { getSupabaseAdmin } from '../api/_lib/supabaseAdmin'
import { isPhoneOptedOut } from '../api/_lib/smsOptOut'

// No test here may reach a real network or database: .env.local can leak prod credentials
// into vitest workers, so Supabase and fetch are both replaced.
vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('../api/_lib/smsOptOut.js', () => ({
  isPhoneOptedOut: vi.fn(),
}))

const mockAdmin = vi.mocked(getSupabaseAdmin)
const mockOptedOut = vi.mocked(isPhoneOptedOut)

type OrgRow = { sms_from_number?: string | null; sms_provider?: string | null } | null

/** orgs lookup double. `providerColumnMissing` mimics prod before the T1.18 migration. */
function mockOrg(row: OrgRow, options: { providerColumnMissing?: boolean } = {}) {
  const selects: string[] = []
  const client = {
    from: () => ({
      select: (columns: string) => {
        selects.push(columns)
        return {
          eq: () => ({
            maybeSingle: async () => {
              if (options.providerColumnMissing && columns.includes('sms_provider')) {
                return { data: null, error: { message: 'column orgs.sms_provider does not exist' } }
              }
              return { data: row, error: null }
            },
          }),
        }
      },
    }),
  }
  mockAdmin.mockReturnValue(client as never)
  return { client, selects }
}

function mockFetchJson(status: number, json: unknown) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  } as Response)
}

describe('parseSmsProvider', () => {
  it('defaults anything unrecognised to twilio', () => {
    expect(parseSmsProvider('mobilemessage')).toBe('mobilemessage')
    expect(parseSmsProvider('twilio')).toBe('twilio')
    expect(parseSmsProvider(null)).toBe('twilio')
    expect(parseSmsProvider('MobileMessage')).toBe('twilio')
  })
})

describe('loadOrgSmsConfig', () => {
  it('falls back to Twilio when the sms_provider column does not exist yet', async () => {
    const { client, selects } = mockOrg(
      { sms_from_number: '+61468050366' },
      { providerColumnMissing: true }
    )
    const config = await loadOrgSmsConfig(client as never, 'org-a')
    expect(config).toEqual({ provider: 'twilio', from: '+61468050366' })
    expect(selects).toEqual(['sms_from_number, sms_provider', 'sms_from_number'])
  })
})

describe('sendOrgSms', () => {
  const env = process.env

  beforeEach(() => {
    process.env = {
      ...env,
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+611300000000',
      MOBILE_MESSAGE_API_USERNAME: 'mm-user',
      MOBILE_MESSAGE_API_PASSWORD: 'mm-pass',
    }
    vi.stubGlobal('fetch', vi.fn())
    mockOptedOut.mockReset()
    mockOptedOut.mockResolvedValue(false)
  })

  it('skips when the org has no sender number', async () => {
    mockOrg({ sms_from_number: null, sms_provider: 'twilio' })
    const result = await sendOrgSms({ orgId: 'org-a', to: '0412345678', body: 'Hi' })
    expect(result).toEqual({ sent: false, skipped: 'no_sender_number', provider: 'twilio' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not fall back to TWILIO_FROM_NUMBER', async () => {
    mockOrg({ sms_from_number: '  ', sms_provider: 'twilio' })
    const result = await sendOrgSms({ orgId: 'org-a', to: '0412345678', body: 'Hi' })
    expect(result.skipped).toBe('no_sender_number')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('skips opted-out destinations on either provider', async () => {
    mockOptedOut.mockResolvedValue(true)
    for (const provider of ['twilio', 'mobilemessage']) {
      mockOrg({ sms_from_number: '+61468050366', sms_provider: provider })
      const result = await sendOrgSms({ orgId: 'org-a', to: '0412345678', body: 'Hi' })
      expect(result).toEqual({ sent: false, skipped: 'opted_out', provider })
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('dispatches a twilio org to Twilio from the org sender', async () => {
    mockOrg({ sms_from_number: '+61468050366', sms_provider: 'twilio' })
    mockFetchJson(201, { sid: 'SMorg' })

    const result = await sendOrgSms({ orgId: 'org-a', to: '0412345678', body: 'Hi there' })
    expect(result).toEqual({ sent: true, sid: 'SMorg', provider: 'twilio' })
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('api.twilio.com')
    expect(init.body).toContain('From=%2B61468050366')
    expect(init.body).not.toContain('From=%2B611300000000')
  })

  it('dispatches a mobilemessage org to Mobile Message from the org sender', async () => {
    mockOrg({ sms_from_number: '+61400111222', sms_provider: 'mobilemessage' })
    mockFetchJson(200, {
      status: 'complete',
      results: [{ status: 'success', message_id: 'mm-uuid-1', to: '61412345678' }],
    })

    const result = await sendOrgSms({ orgId: 'org-b', to: '0412 345 678', body: 'On our way 🚐' })
    expect(result).toEqual({ sent: true, sid: 'mm-uuid-1', provider: 'mobilemessage' })

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.mobilemessage.com.au/v1/messages')
    const payload = JSON.parse(init.body as string)
    expect(payload.enable_unicode).toBe(true)
    expect(payload.messages).toEqual([
      { to: '61412345678', message: 'On our way 🚐', sender: '61400111222' },
    ])
  })

  it('a pre-migration database (no sms_provider column) still sends via Twilio', async () => {
    mockOrg({ sms_from_number: '+61468050366' }, { providerColumnMissing: true })
    mockFetchJson(201, { sid: 'SMlegacy' })

    const result = await sendOrgSms({ orgId: 'org-a', to: '0412345678', body: 'Hi' })
    expect(result).toEqual({ sent: true, sid: 'SMlegacy', provider: 'twilio' })
  })
})

describe('isOrgSmsReady', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.MOBILE_MESSAGE_API_USERNAME
    delete process.env.MOBILE_MESSAGE_API_PASSWORD
    process.env.TWILIO_ACCOUNT_SID = 'ACtest'
    process.env.TWILIO_AUTH_TOKEN = 'token'
  })

  it('checks the credentials of the org’s own provider, not Twilio alone', async () => {
    mockOrg({ sms_from_number: '+61468050366', sms_provider: 'twilio' })
    await expect(isOrgSmsReady('org-a')).resolves.toBe(true)

    mockOrg({ sms_from_number: '+61400111222', sms_provider: 'mobilemessage' })
    await expect(isOrgSmsReady('org-b')).resolves.toBe(false)

    process.env.MOBILE_MESSAGE_API_USERNAME = 'mm-user'
    process.env.MOBILE_MESSAGE_API_PASSWORD = 'mm-pass'
    delete process.env.TWILIO_AUTH_TOKEN
    await expect(isOrgSmsReady('org-b')).resolves.toBe(true)
  })

  it('is false without a sender number', async () => {
    mockOrg({ sms_from_number: null, sms_provider: 'twilio' })
    await expect(isOrgSmsReady('org-a')).resolves.toBe(false)
  })
})
