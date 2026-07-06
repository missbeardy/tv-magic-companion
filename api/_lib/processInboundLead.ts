import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyManagersNewLead } from './notifyManagersNewLead.js'
import { sendLeadAckSmsIfEnabled } from './leadAckSms.js'
import { sendMissedCallHookbackIfEnabled } from './missedCallHookbackSms.js'
import {
  updateLeadFromExtraction,
  type ExtractedLeadFields,
} from './rawFirstLead.js'
import { NOOP_RECORDER, startWorkflowRun, type WorkflowRunRecorder } from './workflowRun.js'

export interface SavedLeadRow {
  id?: string
  name?: string | null
  service_type?: string | null
  status?: string | null
  phone?: string | null
}

export interface ProcessInboundLeadExtractionResult {
  updateFields: ExtractedLeadFields
  /** Runs after updateLeadFromExtraction (e.g. voicemail transcript → raw_email). */
  afterUpdate?: (leadId: string) => Promise<void>
}

export type ProcessInboundLeadExtractFn = (
  leadId: string
) => Promise<ProcessInboundLeadExtractionResult | null | void>

export interface ProcessInboundLeadFollowUp {
  type: 'ack' | 'hookback'
  source: string
  resolvePhone: (ctx: ProcessInboundLeadContext) => string | null | undefined
  resolveCustomerName: (ctx: ProcessInboundLeadContext) => string
}

export interface ProcessInboundLeadContext {
  leadId: string
  orgId: string
  savedLead: SavedLeadRow | null
  extraction: ProcessInboundLeadExtractionResult | null
}

export interface ProcessInboundLeadRunInput {
  workflowKey: 'inbound_lead'
  triggerChannel: string
  triggerSummary: Record<string, unknown>
}

export interface ProcessInboundLeadInput {
  supabase: SupabaseClient
  orgId: string
  /** Perform insert (insertRawFirstLead wrapper or direct supabase insert for calls). */
  insertLead: () => Promise<{ id: string }>
  createdEvent: {
    note: string
    payload: Record<string, unknown>
  }
  /** Channel-specific extraction; omit for missed-call (no AI step). */
  extract?: ProcessInboundLeadExtractFn
  /** Columns to select after pipeline. Default: name, service_type, status */
  selectColumns?: string
  buildNotify: (ctx: ProcessInboundLeadContext) => {
    name: string
    service_type: string
    status: string
  }
  followUp?: ProcessInboundLeadFollowUp
  logLabel: string
  run?: ProcessInboundLeadRunInput
}

export interface ProcessInboundLeadResult {
  leadId: string
  savedLead: SavedLeadRow | null
  hookbackSent?: boolean
  partial?: boolean
}

/**
 * Shared inbound lead pipeline: insert → created event → extraction/update →
 * fetch saved lead → notify managers → ack or hookback SMS.
 */
export async function processInboundLead(
  input: ProcessInboundLeadInput
): Promise<ProcessInboundLeadResult> {
  const {
    supabase,
    orgId,
    insertLead,
    createdEvent,
    extract,
    selectColumns = 'name, service_type, status',
    buildNotify,
    followUp,
    logLabel,
    run,
  } = input

  const recorder: WorkflowRunRecorder = run
    ? startWorkflowRun(supabase, {
        workflowKey: run.workflowKey,
        orgId,
        triggerChannel: run.triggerChannel,
        triggerSummary: run.triggerSummary,
      })
    : NOOP_RECORDER

  let runFinished = false
  const finishRun = (status: 'succeeded' | 'partial' | 'failed') => {
    if (runFinished) return
    runFinished = true
    recorder.finish(status)
  }

  let leadId: string
  try {
    const insertResult = await insertLead()
    leadId = insertResult.id
    recorder.step('insert_lead', 'succeeded')
  } catch (insertErr) {
    recorder.step('insert_lead', 'failed', { error: insertErr })
    finishRun('failed')
    throw insertErr
  }

  recorder.attachLead(leadId)

  let extraction: ProcessInboundLeadExtractionResult | null = null
  let savedLead: SavedLeadRow | null = null
  let hookbackSent = false
  let partial = false

  try {
    const { error: createdErr } = await supabase.from('lead_events').insert({
      lead_id: leadId,
      org_id: orgId,
      event_type: 'created',
      note: createdEvent.note,
      payload: createdEvent.payload,
    })
    recorder.step('created_event', createdErr ? 'failed' : 'succeeded', {
      error: createdErr ?? undefined,
    })

    if (extract) {
      try {
        extraction = (await extract(leadId)) ?? null
        recorder.step('extract', 'succeeded')
      } catch (extractErr) {
        recorder.step('extract', 'failed', { error: extractErr })
        throw extractErr
      }

      if (extraction?.updateFields) {
        try {
          await updateLeadFromExtraction(supabase, leadId, extraction.updateFields)
          recorder.step('apply_extraction', 'succeeded')
        } catch (updateErr) {
          console.error(`${logLabel} extraction update failed:`, updateErr)
          recorder.step('apply_extraction', 'failed', { error: updateErr })
          partial = true
        }
      } else {
        recorder.step('apply_extraction', 'skipped')
      }

      if (extraction?.afterUpdate) {
        try {
          await extraction.afterUpdate(leadId)
          recorder.step('after_extraction', 'succeeded')
        } catch (afterErr) {
          console.error(`${logLabel} post-extraction update failed:`, afterErr)
          recorder.step('after_extraction', 'failed', { error: afterErr })
          partial = true
        }
      } else {
        recorder.step('after_extraction', 'skipped')
      }
    } else {
      recorder.step('extract', 'skipped')
      recorder.step('apply_extraction', 'skipped')
      recorder.step('after_extraction', 'skipped')
    }

    const { data } = await supabase
      .from('leads')
      .select(selectColumns)
      .eq('id', leadId)
      .single()
    savedLead = data
    recorder.step('fetch_saved_lead', 'succeeded')

    const ctx: ProcessInboundLeadContext = {
      leadId,
      orgId,
      savedLead,
      extraction,
    }

    try {
      const notifyPayload = buildNotify(ctx)
      await notifyManagersNewLead({
        id: leadId,
        org_id: orgId,
        name: notifyPayload.name,
        service_type: notifyPayload.service_type,
        status: notifyPayload.status,
      })
      recorder.step('notify_managers', 'succeeded')
    } catch (notifyErr) {
      console.error(`Manager notification failed for ${logLabel}:`, notifyErr)
      recorder.step('notify_managers', 'failed', { error: notifyErr })
      partial = true
    }

    if (followUp) {
      const toPhone = followUp.resolvePhone(ctx)
      if (toPhone) {
        try {
          let sent = false
          if (followUp.type === 'ack') {
            sent = await sendLeadAckSmsIfEnabled({
              orgId,
              leadId,
              toPhone,
              customerName: followUp.resolveCustomerName(ctx),
              source: followUp.source,
            })
          } else {
            hookbackSent = await sendMissedCallHookbackIfEnabled({
              orgId,
              leadId,
              toPhone,
              customerName: followUp.resolveCustomerName(ctx),
              source: followUp.source,
            })
            sent = hookbackSent
          }
          recorder.step('follow_up_sms', 'succeeded', {
            output: { type: followUp.type, sent },
          })
        } catch (followUpErr) {
          console.error(`${logLabel} follow-up SMS failed:`, followUpErr)
          recorder.step('follow_up_sms', 'failed', {
            error: followUpErr,
            output: { type: followUp.type, sent: false },
          })
          partial = true
        }
      } else {
        recorder.step('follow_up_sms', 'skipped')
      }
    } else {
      recorder.step('follow_up_sms', 'skipped')
    }
  } catch (postInsertErr) {
    console.error(`${logLabel} post-save processing error:`, postInsertErr)
    partial = true
  } finally {
    if (!runFinished) {
      finishRun(partial ? 'partial' : 'succeeded')
    }
  }

  return { leadId, savedLead, hookbackSent, partial: partial || undefined }
}
