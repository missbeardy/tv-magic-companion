import { beforeEach, describe, expect, it, vi } from 'vitest'

// Employee alerts are SMS-only since T1.18 deleted employee WhatsApp. Both transports are
// mocked, so nothing here can reach Twilio or Mobile Message.
vi.mock('../api/_lib/smsSend.js', () => ({
  sendOrgSms: vi.fn(),
}))
vi.mock('../api/_lib/twilioSend.js', () => ({
  sendPlatformSms: vi.fn(),
}))

import { sendEmployeeAlertToPhone, sendEmployeeSms } from '../api/_lib/sendEmployeeAlert'
import { sendOrgSms } from '../api/_lib/smsSend'
import { sendPlatformSms } from '../api/_lib/twilioSend'

const mockOrgSms = vi.mocked(sendOrgSms)
const mockPlatformSms = vi.mocked(sendPlatformSms)

describe('sendEmployeeSms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends from the org number via the org provider when an org is given', async () => {
    mockOrgSms.mockResolvedValue({ sent: true, sid: 'mm-uuid', provider: 'mobilemessage' })

    const result = await sendEmployeeSms('0412345678', 'New lead', 'org-a')
    expect(result).toEqual({ sent: true, channel: 'sms', sid: 'mm-uuid' })
    expect(mockOrgSms).toHaveBeenCalledWith({ orgId: 'org-a', to: '0412345678', body: 'New lead' })
    expect(mockPlatformSms).not.toHaveBeenCalled()
  })

  it('uses the platform sender when there is no org', async () => {
    mockPlatformSms.mockResolvedValue({ sent: true, sid: 'SMplat' })

    const result = await sendEmployeeSms('0412345678', 'Probe failed')
    expect(result).toEqual({ sent: true, channel: 'sms', sid: 'SMplat' })
    expect(mockOrgSms).not.toHaveBeenCalled()
  })

  it('reports a missing org sender as "SMS not configured"', async () => {
    mockOrgSms.mockResolvedValue({ sent: false, skipped: 'no_sender_number', provider: 'twilio' })
    const result = await sendEmployeeSms('0412345678', 'Hi', 'org-a')
    expect(result).toEqual({ sent: false, skipped: 'SMS not configured' })
  })

  it('passes provider errors through', async () => {
    mockOrgSms.mockResolvedValue({ sent: false, error: 'Insufficient credits', provider: 'mobilemessage' })
    const result = await sendEmployeeSms('0412345678', 'Hi', 'org-a')
    expect(result).toEqual({ sent: false, skipped: undefined, error: 'Insufficient credits' })
  })
})

describe('sendEmployeeAlertToPhone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips a profile with no phone', async () => {
    const result = await sendEmployeeAlertToPhone('  ', 'Hi', 'org-a')
    expect(result).toEqual({ sent: false, skipped: 'No phone on profile' })
    expect(mockOrgSms).not.toHaveBeenCalled()
  })

  it('never throws', async () => {
    mockOrgSms.mockRejectedValue(new Error('boom'))
    const result = await sendEmployeeAlertToPhone('0412345678', 'Hi', 'org-a')
    expect(result).toEqual({ sent: false, error: 'Failed to send SMS' })
  })
})
