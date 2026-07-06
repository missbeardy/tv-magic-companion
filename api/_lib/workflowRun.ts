import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkflowKey } from '../../shared/workflowRegistry.js'

const LOG_TAG = '[WORKFLOW_RUN_LOG_FAILED]'
const MAX_JSON_BYTES = 2048

const PII_KEY_PATTERN =
  /^(phone|email|name|message|body|text|transcript|raw_|from|to|customer_name|sender)$/i

export type WorkflowRunStatus = 'running' | 'succeeded' | 'partial' | 'failed'
export type WorkflowStepStatus = 'succeeded' | 'failed' | 'skipped'

export interface WorkflowRunRecorder {
  step(
    nodeId: string,
    status: WorkflowStepStatus,
    opts?: { output?: Record<string, unknown>; error?: unknown }
  ): Promise<void>
  attachLead(leadId: string): Promise<void>
  finish(status: Exclude<WorkflowRunStatus, 'running'>): Promise<void>
}

export interface StartWorkflowRunInput {
  workflowKey: WorkflowKey
  orgId: string
  triggerChannel?: string
  triggerSummary?: Record<string, unknown>
}

function isLoggingDisabled(): boolean {
  return process.env.WORKFLOW_RUN_LOGGING_DISABLED === 'true'
}

function jsonByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return MAX_JSON_BYTES + 1
  }
}

function truncateString(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value
  let end = value.length
  while (end > 0 && Buffer.byteLength(value.slice(0, end), 'utf8') > maxBytes) {
    end -= 1
  }
  return value.slice(0, end)
}

function redactPiiKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(redactPiiKeys)
  if (typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (PII_KEY_PATTERN.test(key)) continue
    out[key] = redactPiiKeys(val)
  }
  return out
}

/** Cap jsonb payload at maxBytes; never throws. */
export function truncateWorkflowJson(
  value: unknown,
  maxBytes = MAX_JSON_BYTES
): Record<string, unknown> | null {
  if (value === null || value === undefined) return null

  const redacted = redactPiiKeys(value)
  if (jsonByteLength(redacted) <= maxBytes) {
    return typeof redacted === 'object' && !Array.isArray(redacted)
      ? (redacted as Record<string, unknown>)
      : { value: redacted }
  }

  if (typeof redacted === 'string') {
    return { message: truncateString(redacted, maxBytes), _truncated: true }
  }

  if (typeof redacted !== 'object' || Array.isArray(redacted)) {
    const serialized = String(redacted)
    return { message: truncateString(serialized, maxBytes), _truncated: true }
  }

  const obj = redacted as Record<string, unknown>
  const result: Record<string, unknown> = {}
  let truncated = false

  for (const [key, val] of Object.entries(obj)) {
    const candidate = { ...result, [key]: val }
    if (jsonByteLength(candidate) <= maxBytes) {
      result[key] = val
    } else {
      truncated = true
      if (typeof val === 'string') {
        const room = maxBytes - jsonByteLength(result) - 20
        if (room > 0) result[key] = truncateString(val, room)
      }
      break
    }
  }

  if (truncated || jsonByteLength(result) > maxBytes) {
    result._truncated = true
  }

  while (jsonByteLength(result) > maxBytes) {
    const keys = Object.keys(result).filter((k) => k !== '_truncated')
    if (keys.length === 0) break
    const lastKey = keys[keys.length - 1]
    const val = result[lastKey]
    if (typeof val === 'string' && val.length > 0) {
      result[lastKey] = val.slice(0, Math.max(0, val.length - 64))
    } else {
      delete result[lastKey]
    }
    result._truncated = true
  }

  return result
}

function normalizeError(error: unknown): Record<string, unknown> | null {
  if (error === null || error === undefined) return null
  if (error instanceof Error) {
    return truncateWorkflowJson({
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    })
  }
  if (typeof error === 'string') {
    return truncateWorkflowJson({ message: error })
  }
  return truncateWorkflowJson({ message: String(error) })
}

function logFailure(context: string, err: unknown): void {
  console.error(`${LOG_TAG} ${context}:`, err)
}

const noopRecorder: WorkflowRunRecorder = {
  async step() {},
  async attachLead() {},
  async finish() {},
}

export const NOOP_RECORDER: WorkflowRunRecorder = noopRecorder

function createRecorder(
  supabase: SupabaseClient,
  runId: string
): WorkflowRunRecorder {
  let seq = 0
  let finished = false

  return {
    async step(nodeId, status, opts = {}) {
      try {
        const output = opts.output ? truncateWorkflowJson(opts.output) : null
        const error = opts.error ? normalizeError(opts.error) : null
        const stepSeq = ++seq
        const startedAt = new Date().toISOString()

        const { error: insertErr } = await supabase.from('workflow_run_steps').insert({
          run_id: runId,
          node_id: nodeId,
          seq: stepSeq,
          status,
          output,
          error,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        })

        if (insertErr) logFailure(`step ${nodeId}`, insertErr)
      } catch (err) {
        logFailure(`step ${nodeId}`, err)
      }
    },

    async attachLead(leadId) {
      try {
        const { data: row, error: fetchErr } = await supabase
          .from('workflow_runs')
          .select('trigger_summary')
          .eq('id', runId)
          .single()

        if (fetchErr) {
          logFailure('attachLead fetch', fetchErr)
          return
        }

        const merged = {
          ...(typeof row?.trigger_summary === 'object' && row.trigger_summary !== null
            ? (row.trigger_summary as Record<string, unknown>)
            : {}),
          lead_id: leadId,
        }

        const { error: updateErr } = await supabase
          .from('workflow_runs')
          .update({ trigger_summary: truncateWorkflowJson(merged) })
          .eq('id', runId)

        if (updateErr) logFailure('attachLead update', updateErr)
      } catch (err) {
        logFailure('attachLead', err)
      }
    },

    async finish(status) {
      if (finished) return
      finished = true

      try {
        const { error: updateErr } = await supabase
          .from('workflow_runs')
          .update({
            status,
            finished_at: new Date().toISOString(),
          })
          .eq('id', runId)

        if (updateErr) logFailure('finish', updateErr)
      } catch (err) {
        logFailure('finish', err)
      }
    },
  }
}

/** Awaited start — required so Vercel does not freeze before writes complete. */
export async function startWorkflowRun(
  supabase: SupabaseClient,
  input: StartWorkflowRunInput
): Promise<WorkflowRunRecorder> {
  if (isLoggingDisabled()) return noopRecorder

  try {
    const summary = input.triggerSummary
      ? truncateWorkflowJson(input.triggerSummary)
      : null

    const { data, error } = await supabase
      .from('workflow_runs')
      .insert({
        org_id: input.orgId,
        workflow_key: input.workflowKey,
        trigger_channel: input.triggerChannel ?? null,
        trigger_summary: summary,
        status: 'running',
      })
      .select('id')
      .single()

    if (error || !data?.id) {
      logFailure('initial insert', error ?? 'no id returned')
      return noopRecorder
    }

    return createRecorder(supabase, data.id)
  } catch (err) {
    logFailure('initial insert', err)
    return noopRecorder
  }
}

export async function purgeOldWorkflowRuns(
  supabase: SupabaseClient,
  days = 30
): Promise<{ deleted: number }> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffIso = cutoff.toISOString()

  const { data, error } = await supabase
    .from('workflow_runs')
    .delete()
    .lt('started_at', cutoffIso)
    .select('id')

  if (error) {
    logFailure('purge', error)
    throw error
  }

  return { deleted: data?.length ?? 0 }
}
