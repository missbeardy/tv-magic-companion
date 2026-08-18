import { describe, expect, it, vi, beforeEach } from 'vitest'
import { notifyOrgUser, insertTrustedFollowUpReminder } from '../api/_lib/notifyUser'

const sendPushToUsers = vi.fn()
const sendEmployeeAlertToPhone = vi.fn()

vi.mock('../api/_lib/pushTransport.js', () => ({
  sendPushToUsers: (...args: unknown[]) => sendPushToUsers(...args),
}))

vi.mock('../api/_lib/sendEmployeeAlert.js', () => ({
  sendEmployeeAlertToPhone: (...args: unknown[]) => sendEmployeeAlertToPhone(...args),
}))

vi.mock('../api/_lib/platformUrl.js', () => ({
  getPlatformUrl: () => 'https://example.test',
}))

function mockSupabase(profileOrgId: string | null = 'org-1') {
  const tables: string[] = []
  const inserts: Record<string, unknown>[] = []
  const supabase = {
    from(table: string) {
      tables.push(table)
      if (table === 'notifications') {
        return {
          insert: async (row: Record<string, unknown>) => {
            inserts.push(row)
            return { error: null }
          },
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: profileOrgId ? { org_id: profileOrgId, phone: '+61400000000' } : null,
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    },
  }
  return { supabase, tables, inserts }
}

describe('notifyOrgUser', () => {
  beforeEach(() => {
    sendPushToUsers.mockReset()
    sendEmployeeAlertToPhone.mockReset()
    sendEmployeeAlertToPhone.mockResolvedValue({ sent: true, channel: 'sms' })
  })

  // `type` arrives from the request body in api/send-sms.ts handleNotify, and notifications RLS
  // is `USING (user_id = auth.uid())`. If any type value can skip the membership check, an
  // authenticated user can post a notification into another org's user's bell.
  it.each([
    'lead_assigned',
    'quote_accepted',
    'contact_follow_up',
    'anything_else',
  ])('rejects a cross-org userId for type %s', async (type) => {
    const { supabase, tables, inserts } = mockSupabase('org-OTHER')

    const result = await notifyOrgUser({
      supabase: supabase as never,
      orgId: 'org-1',
      userId: 'tech-in-another-org',
      title: 'Title',
      message: 'Message',
      type,
    })

    expect(result).toEqual({ ok: false, error: 'User not in organisation' })
    expect(tables).toContain('profiles')
    expect(inserts).toHaveLength(0)
    expect(sendPushToUsers).not.toHaveBeenCalled()
    expect(sendEmployeeAlertToPhone).not.toHaveBeenCalled()
  })

  it('rejects when the target profile does not exist', async () => {
    const { supabase, inserts } = mockSupabase(null)

    const result = await notifyOrgUser({
      supabase: supabase as never,
      orgId: 'org-1',
      userId: 'ghost',
      title: 'Title',
      message: 'Message',
      type: 'contact_follow_up',
    })

    expect(result).toEqual({ ok: false, error: 'User not in organisation' })
    expect(inserts).toHaveLength(0)
  })

  it('checks membership before inserting for a same-org user', async () => {
    const { supabase, tables, inserts } = mockSupabase('org-1')

    const result = await notifyOrgUser({
      supabase: supabase as never,
      orgId: 'org-1',
      userId: 'tech-1',
      title: 'Title',
      message: 'Message',
      type: 'quote_accepted',
    })

    expect(result.ok).toBe(true)
    expect(tables[0]).toBe('profiles')
    expect(inserts).toHaveLength(1)
  })

  // The membership check must NOT drag the follow-up reminder onto paid transports. Removing
  // the old contact_follow_up early-exit also removed the guards that kept it in-app only.
  it('keeps contact_follow_up in-app only even via the public path', async () => {
    const { supabase, inserts } = mockSupabase('org-1')

    const result = await notifyOrgUser({
      supabase: supabase as never,
      orgId: 'org-1',
      userId: 'tech-1',
      title: 'Lead needs 2nd Attempt',
      message: 'Jane (TV Aerial) — no contact in 6 hours.',
      type: 'contact_follow_up',
    })

    expect(result.ok).toBe(true)
    expect(inserts).toHaveLength(1)
    expect(sendPushToUsers).not.toHaveBeenCalled()
    expect(sendEmployeeAlertToPhone).not.toHaveBeenCalled()
    expect(result.alert?.sent).toBe(false)
  })

  it('still sends push and employee alert for other types', async () => {
    const { supabase } = mockSupabase('org-1')

    await notifyOrgUser({
      supabase: supabase as never,
      orgId: 'org-1',
      userId: 'tech-1',
      title: 'Title',
      message: 'Message',
      type: 'quote_accepted',
    })

    expect(sendPushToUsers).toHaveBeenCalledTimes(1)
    expect(sendEmployeeAlertToPhone).toHaveBeenCalledTimes(1)
  })
})

describe('insertTrustedFollowUpReminder', () => {
  beforeEach(() => {
    sendPushToUsers.mockReset()
    sendEmployeeAlertToPhone.mockReset()
  })

  it('inserts the in-app reminder without a profile round-trip', async () => {
    const { supabase, tables, inserts } = mockSupabase()

    const result = await insertTrustedFollowUpReminder({
      supabase: supabase as never,
      orgId: 'org-1',
      userId: 'tech-1',
      title: 'Lead needs 2nd Attempt',
      message: 'Jane (TV Aerial) — no contact in 6 hours.',
      leadId: 'lead-1',
      url: 'https://example.test/leads?lead=lead-1',
    })

    expect(result.ok).toBe(true)
    expect(result.alert?.skipped).toBe('Skipped for contact_follow_up')
    // org_id and assigned_to come from the leads row, so there is no caller identity to validate.
    expect(tables).toEqual(['notifications'])
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      user_id: 'tech-1',
      org_id: 'org-1',
      lead_id: 'lead-1',
      title: 'Lead needs 2nd Attempt',
      message: 'Jane (TV Aerial) — no contact in 6 hours.',
      type: 'contact_follow_up',
      read: false,
    })
  })

  it('invokes no external transport', async () => {
    const { supabase } = mockSupabase()

    await insertTrustedFollowUpReminder({
      supabase: supabase as never,
      orgId: 'org-1',
      userId: 'tech-1',
      title: 'Title',
      message: 'Message',
      leadId: 'lead-1',
    })

    expect(sendPushToUsers).not.toHaveBeenCalled()
    expect(sendEmployeeAlertToPhone).not.toHaveBeenCalled()
  })

  it('surfaces an insert failure instead of reporting success', async () => {
    const supabase = {
      from: () => ({ insert: async () => ({ error: { message: 'insert exploded' } }) }),
    }

    const result = await insertTrustedFollowUpReminder({
      supabase: supabase as never,
      orgId: 'org-1',
      userId: 'tech-1',
      title: 'Title',
      message: 'Message',
      leadId: 'lead-1',
    })

    expect(result).toEqual({ ok: false, error: 'insert exploded' })
  })
})
