import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/apiAuth', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer t' }),
}))
vi.mock('../src/lib/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}))

import { fetchWithTimeout } from '../src/lib/fetchWithTimeout'
import { sendNotification } from '../src/lib/notify'

const mockFetch = vi.mocked(fetchWithTimeout)

function sentBody(): Record<string, unknown> {
  const init = mockFetch.mock.calls[0][1] as RequestInit
  return JSON.parse(init.body as string)
}

describe('sendNotification', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  // handleNotify (AUD-17) 400s an over-length title/message — trimming here keeps the alert.
  it('trims title and message to the server caps', async () => {
    await sendNotification('u1', 't'.repeat(200), 'm'.repeat(900), '/calendar', 'calendar')

    const body = sentBody()
    expect((body.title as string).length).toBe(120)
    expect((body.message as string).length).toBe(500)
    expect(body.url).toBe('/calendar')
    expect(body.type).toBe('calendar')
  })

  it('passes short payloads through unchanged', async () => {
    await sendNotification('u1', 'New Lead Assigned', 'Jo — Wall mount', '/leads')

    expect(sentBody()).toEqual({
      userId: 'u1',
      title: 'New Lead Assigned',
      message: 'Jo — Wall mount',
      url: '/leads',
      type: 'lead_assigned',
    })
  })
})
