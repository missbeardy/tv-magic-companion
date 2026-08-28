import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TIMEOUT_CLOSE } from '../api/_lib/messengerKb'
import type { MessengerSession } from '../api/_lib/messengerTurn'

vi.mock('../api/_lib/handleInboundFacebookLead.js', () => ({
  ingestParsedFacebookLead: vi.fn(),
}))

vi.mock('../api/_lib/messengerBot.js', () => ({
  deliverMessengerReplies: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../api/_lib/messengerSession.js', () => ({
  listExpiredSuburbSessions: vi.fn(),
  saveMessengerSession: vi.fn().mockResolvedValue(undefined),
}))

import { ingestParsedFacebookLead } from '../api/_lib/handleInboundFacebookLead'
import { deliverMessengerReplies } from '../api/_lib/messengerBot'
import { listExpiredSuburbSessions, saveMessengerSession } from '../api/_lib/messengerSession'
import { runMessengerSuburbTimeout } from '../api/_lib/runMessengerSuburbTimeout'

const mockIngest = vi.mocked(ingestParsedFacebookLead)
const mockList = vi.mocked(listExpiredSuburbSessions)
const mockSave = vi.mocked(saveMessengerSession)
const mockDeliver = vi.mocked(deliverMessengerReplies)

const waiting: MessengerSession = {
  id: 's1',
  org_id: 'org-1',
  page_id: 'page-1',
  psid: 'user-1',
  conversation_id: 'page-1_user-1',
  state: 'awaiting_suburb',
  name: 'Jane',
  phone: '0412345678',
  suburb: null,
  service_needed: 'Wall mount',
  out_of_area: false,
  phone_ask_count: 0,
  awaiting_suburb_until: new Date(0).toISOString(),
  lead_id: null,
  messages: [],
}

describe('runMessengerSuburbTimeout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue([waiting])
    mockIngest.mockResolvedValue({ success: true, lead_id: 'lead-1' })
  })

  it('inserts the lead without suburb and sends the timeout close', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { slug: 'default' }, error: null }),
          }),
        }),
      }),
    }

    const result = await runMessengerSuburbTimeout(supabase as never, new Date())
    expect(result.submitted).toBe(1)
    expect(mockIngest).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        name: 'Jane',
        phone: '0412345678',
        suburb: null,
        conversation_id: 'page-1_user-1',
      }),
      expect.objectContaining({ source: 'native_messenger_timeout' })
    )
    expect(mockDeliver).toHaveBeenCalledWith(
      expect.objectContaining({ replies: [TIMEOUT_CLOSE], psid: 'user-1' })
    )
    expect(mockSave).toHaveBeenCalled()
  })
})
