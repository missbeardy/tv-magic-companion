import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NOOP_RECORDER,
  purgeOldWorkflowRuns,
  startWorkflowRun,
  truncateWorkflowJson,
} from '../api/_lib/workflowRun'

function mockSupabaseForRun(opts: {
  insertError?: { message: string } | null
  runId?: string
  stepInsertError?: { message: string } | null
}) {
  const runUpdates: Record<string, unknown>[] = []
  const steps: Record<string, unknown>[] = []
  const runId = opts.runId ?? 'run-1'

  const supabase = {
    from(table: string) {
      if (table === 'workflow_runs') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => {
                if (opts.insertError) return { data: null, error: opts.insertError }
                return { data: { id: runId }, error: null }
              },
            }),
          }),
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { trigger_summary: { identifier: 'tag' } },
                error: null,
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              runUpdates.push(patch)
              return { error: null }
            },
          }),
          delete: () => ({
            lt: () => ({
              select: async () => ({ data: [{ id: 'old-1' }], error: null }),
            }),
          }),
        }
      }
      if (table === 'workflow_run_steps') {
        return {
          insert: async (row: Record<string, unknown>) => {
            if (opts.stepInsertError) return { error: opts.stepInsertError }
            steps.push(row)
            return { error: null }
          },
        }
      }
      return {}
    },
  }

  return { supabase, runUpdates, steps }
}

describe('truncateWorkflowJson', () => {
  it('caps payload at 2KB with _truncated marker', () => {
    const big = { detail: 'x'.repeat(3000) }
    const result = truncateWorkflowJson(big)
    expect(result?._truncated).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(2048)
  })

  it('redacts PII-like keys', () => {
    const result = truncateWorkflowJson({
      lead_id: 'abc',
      phone: '+61400000000',
      message: 'hello',
    })
    expect(result).toEqual({ lead_id: 'abc' })
  })
})

describe('startWorkflowRun', () => {
  const originalEnv = process.env.WORKFLOW_RUN_LOGGING_DISABLED

  beforeEach(() => {
    delete process.env.WORKFLOW_RUN_LOGGING_DISABLED
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WORKFLOW_RUN_LOGGING_DISABLED
    } else {
      process.env.WORKFLOW_RUN_LOGGING_DISABLED = originalEnv
    }
  })

  it('returns no-op recorder when kill switch is enabled', () => {
    process.env.WORKFLOW_RUN_LOGGING_DISABLED = 'true'
    const { supabase } = mockSupabaseForRun({})
    const recorder = startWorkflowRun(supabase as never, {
      workflowKey: 'inbound_lead',
      orgId: 'org-1',
    })
    expect(recorder).toBe(NOOP_RECORDER)
    recorder.step('insert_lead', 'succeeded')
    recorder.finish('succeeded')
  })

  it('degrades to no-op when initial insert fails', async () => {
    const { supabase } = mockSupabaseForRun({ insertError: { message: 'db down' } })
    const recorder = startWorkflowRun(supabase as never, {
      workflowKey: 'inbound_lead',
      orgId: 'org-1',
    })

    recorder.step('insert_lead', 'succeeded')
    recorder.attachLead('lead-1')
    recorder.finish('succeeded')

    await new Promise((r) => setTimeout(r, 20))
    expect(() => recorder.step('created_event', 'failed')).not.toThrow()
  })

  it('step insert failure does not throw', async () => {
    const { supabase, steps } = mockSupabaseForRun({
      stepInsertError: { message: 'step failed' },
    })
    const recorder = startWorkflowRun(supabase as never, {
      workflowKey: 'inbound_lead',
      orgId: 'org-1',
    })

    expect(() => recorder.step('insert_lead', 'succeeded')).not.toThrow()
    await new Promise((r) => setTimeout(r, 30))
    expect(steps).toHaveLength(0)
  })

  it('finish sets run status', async () => {
    const { supabase, runUpdates } = mockSupabaseForRun({})
    const recorder = startWorkflowRun(supabase as never, {
      workflowKey: 'inbound_lead',
      orgId: 'org-1',
      triggerChannel: 'sms',
      triggerSummary: { identifier: '+611234', source: 'sms' },
    })

    recorder.step('insert_lead', 'succeeded')
    recorder.finish('partial')

    await new Promise((r) => setTimeout(r, 30))

    const finishUpdate = runUpdates.find((u) => u.status === 'partial')
    expect(finishUpdate).toBeDefined()
    expect(finishUpdate?.finished_at).toBeTruthy()
  })
})

describe('purgeOldWorkflowRuns', () => {
  it('deletes runs older than cutoff and returns count', async () => {
    const { supabase } = mockSupabaseForRun({})
    const result = await purgeOldWorkflowRuns(supabase as never, 30)
    expect(result.deleted).toBe(1)
  })
})
