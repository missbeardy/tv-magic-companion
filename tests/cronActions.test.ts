import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: vi.fn(),
}))
vi.mock('../api/_lib/runContactFollowUpCron.js', () => ({
  runContactFollowUpCron: vi.fn(),
}))
vi.mock('../api/_lib/invoiceChase.js', () => ({
  runInvoiceChaseSweep: vi.fn(),
}))
vi.mock('../api/_lib/quoteChase.js', () => ({
  runQuoteChaseSweep: vi.fn(),
}))
vi.mock('../api/_lib/bookingReminder.js', () => ({
  runBookingReminderSweep: vi.fn(),
}))
vi.mock('../api/_lib/workflowRun.js', () => ({
  purgeOldWorkflowRuns: vi.fn(),
}))
vi.mock('../api/_lib/notificationRetention.js', () => ({
  purgeOldNotifications: vi.fn(),
}))
vi.mock('../api/_lib/rateLimit.js', () => ({
  purgeOldRateLimitHits: vi.fn(),
}))

import { getSupabaseAdmin } from '../api/_lib/supabaseAdmin'
import { runContactFollowUpCron } from '../api/_lib/runContactFollowUpCron'
import { runInvoiceChaseSweep } from '../api/_lib/invoiceChase'
import { runQuoteChaseSweep } from '../api/_lib/quoteChase'
import { runBookingReminderSweep } from '../api/_lib/bookingReminder'
import { purgeOldWorkflowRuns } from '../api/_lib/workflowRun'
import { purgeOldNotifications } from '../api/_lib/notificationRetention'
import { purgeOldRateLimitHits } from '../api/_lib/rateLimit'
import {
  handleAutomationSweepsCron,
  handleContactFollowUpCron,
  handleCronMaintenance,
} from '../api/_lib/cronActions'

const mockAdmin = vi.mocked(getSupabaseAdmin)
const mockFollowUp = vi.mocked(runContactFollowUpCron)
const mockInvoice = vi.mocked(runInvoiceChaseSweep)
const mockQuote = vi.mocked(runQuoteChaseSweep)
const mockBooking = vi.mocked(runBookingReminderSweep)
const mockWorkflowPurge = vi.mocked(purgeOldWorkflowRuns)
const mockNotificationPurge = vi.mocked(purgeOldNotifications)
const mockRateLimitPurge = vi.mocked(purgeOldRateLimitHits)

const followUpResult = { checked: 1, reminded: 0, lost: 0, notified: 0, errors: [] }
const sweepResult = { orgs: 0, checked: 0, sent: 0 }
const purgeResult = { deleted: 0 }

function createRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
  }
  return res as unknown as VercelResponse & { statusCode: number; body: unknown }
}

function createReq(
  authorization?: string,
  extras?: { method?: string; cronSecret?: string }
): VercelRequest {
  const headers: Record<string, string> = {}
  if (authorization) headers.authorization = authorization
  if (extras?.cronSecret) headers['x-cron-secret'] = extras.cronSecret
  return {
    method: extras?.method ?? 'POST',
    headers,
    query: {},
  } as unknown as VercelRequest
}

function mockSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const supabase = {
    from: vi.fn((table: string) => {
      if (table !== 'cron_heartbeats') throw new Error(`unexpected table ${table}`)
      return { upsert }
    }),
  }
  mockAdmin.mockReturnValue(supabase as never)
  return { supabase, upsert }
}

describe('cron action isolation', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, CRON_SECRET: 'test-secret' }
    vi.clearAllMocks()
    mockFollowUp.mockResolvedValue(followUpResult)
    mockInvoice.mockResolvedValue(sweepResult)
    mockQuote.mockResolvedValue(sweepResult)
    mockBooking.mockResolvedValue(sweepResult)
    mockWorkflowPurge.mockResolvedValue(purgeResult)
    mockNotificationPurge.mockResolvedValue(purgeResult)
    mockRateLimitPurge.mockResolvedValue(purgeResult)
  })

  afterEach(() => {
    process.env = env
  })

  it('rejects a request without the cron secret', async () => {
    mockSupabase()
    const res = createRes()
    await handleContactFollowUpCron(createReq(), res)

    expect(res.statusCode).toBe(401)
    expect(mockFollowUp).not.toHaveBeenCalled()
  })

  it('rejects a wrong Bearer secret', async () => {
    mockSupabase()
    const res = createRes()
    await handleContactFollowUpCron(createReq('Bearer nope'), res)

    expect(res.statusCode).toBe(401)
    expect(mockFollowUp).not.toHaveBeenCalled()
  })

  it('accepts x-cron-secret', async () => {
    const { upsert } = mockSupabase()
    const res = createRes()
    await handleContactFollowUpCron(createReq(undefined, { cronSecret: 'test-secret' }), res)

    expect(res.statusCode).toBe(200)
    expect(mockFollowUp).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalled()
  })

  it('contact follow-up cannot call chase or purge dependencies', async () => {
    const { upsert } = mockSupabase()
    const res = createRes()
    await handleContactFollowUpCron(createReq('Bearer test-secret'), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true, ...followUpResult })
    expect(mockFollowUp).toHaveBeenCalledTimes(1)
    expect(mockInvoice).not.toHaveBeenCalled()
    expect(mockQuote).not.toHaveBeenCalled()
    expect(mockBooking).not.toHaveBeenCalled()
    expect(mockWorkflowPurge).not.toHaveBeenCalled()
    expect(mockNotificationPurge).not.toHaveBeenCalled()
    expect(mockRateLimitPurge).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        cron_key: 'contact_follow_up',
        last_result: followUpResult,
      })
    )
  })

  it('automation invokes exactly the three sweep dependencies', async () => {
    const { upsert } = mockSupabase()
    const res = createRes()
    await handleAutomationSweepsCron(createReq('Bearer test-secret'), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      invoiceChase: sweepResult,
      quoteChase: sweepResult,
      bookingReminder: sweepResult,
    })
    expect(mockInvoice).toHaveBeenCalledTimes(1)
    expect(mockQuote).toHaveBeenCalledTimes(1)
    expect(mockBooking).toHaveBeenCalledTimes(1)
    expect(mockFollowUp).not.toHaveBeenCalled()
    expect(mockWorkflowPurge).not.toHaveBeenCalled()
    expect(mockNotificationPurge).not.toHaveBeenCalled()
    expect(mockRateLimitPurge).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ cron_key: 'automation_sweeps' })
    )
  })

  it('maintenance invokes exactly the three purge dependencies', async () => {
    const { upsert } = mockSupabase()
    const res = createRes()
    await handleCronMaintenance(createReq('Bearer test-secret'), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      workflowPurge: purgeResult,
      notificationPurge: purgeResult,
      rateLimitPurge: purgeResult,
    })
    expect(mockWorkflowPurge).toHaveBeenCalledTimes(1)
    expect(mockNotificationPurge).toHaveBeenCalledTimes(1)
    expect(mockRateLimitPurge).toHaveBeenCalledTimes(1)
    expect(mockFollowUp).not.toHaveBeenCalled()
    expect(mockInvoice).not.toHaveBeenCalled()
    expect(mockQuote).not.toHaveBeenCalled()
    expect(mockBooking).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ cron_key: 'cron_maintenance' })
    )
  })

  it('a thrown dependency produces a failed result and does not write a success heartbeat', async () => {
    const { upsert } = mockSupabase()
    mockInvoice.mockRejectedValue(new Error('invoice chase timed out'))
    const res = createRes()
    await handleAutomationSweepsCron(createReq('Bearer test-secret'), res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ error: 'invoice chase timed out' })
    expect(upsert).not.toHaveBeenCalled()
  })
})
