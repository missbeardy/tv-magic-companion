import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyManagersNewLead } from './notifyManagersNewLead.js'
import { sendLeadAckSmsIfEnabled } from './leadAckSms.js'
import { sendMissedCallHookbackIfEnabled } from './missedCallHookbackSms.js'
import {
  updateLeadFromExtraction,
  type ExtractedLeadFields,
} from './rawFirstLead.js'
import { NOOP_RECORDER, startWorkflowRun, type WorkflowRunRecorder } from './workflowRun.js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { linkCustomerForLead } from './customers.js'

export interface SavedLeadRow {
  id?: string
  name?: string | null
  service_type?: string | null
  status?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
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
  /**
   * Columns to select after pipeline. Default includes the contact fields the
   * customer linker needs (phone/email/address). Callers that override this
   * MUST keep those columns for customer linking to work.
   */
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
    selectColumns = 'name, service_type, status, phone, email, address',
    buildNotify,
    followUp,
    logLabel,
    run,
  } = input

  const recorder: WorkflowRunRecorder = run
    ? await startWorkflowRun(supabase, {
        workflowKey: run.workflowKey,
        orgId,
        triggerChannel: run.triggerChannel,
        triggerSummary: run.triggerSummary,
      })
    : NOOP_RECORDER

  let runFinished = false
  const finishRun = async (status: 'succeeded' | 'partial' | 'failed') => {
    if (runFinished) return
    runFinished = true
    await recorder.finish(status)
  }

  let leadId: string
  try {
    const insertResult = await insertLead()
    leadId = insertResult.id
    await recorder.step('insert_lead', 'succeeded')
  } catch (insertErr) {
    await recorder.step('insert_lead', 'failed', { error: insertErr })
    await finishRun('failed')
    throw insertErr
  }

  await recorder.attachLead(leadId)

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
    await recorder.step('created_event', createdErr ? 'failed' : 'succeeded', {
      error: createdErr ?? undefined,
    })

    if (extract) {
      try {
        extraction = (await extract(leadId)) ?? null
        await recorder.step('extract', 'succeeded')
      } catch (extractErr) {
        await recorder.step('extract', 'failed', { error: extractErr })
        throw extractErr
      }

      if (extraction?.updateFields) {
        try {
          await updateLeadFromExtraction(supabase, leadId, extraction.updateFields)
          await recorder.step('apply_extraction', 'succeeded')
        } catch (updateErr) {
          console.error(`${logLabel} extraction update failed:`, updateErr)
          await recorder.step('apply_extraction', 'failed', { error: updateErr })
          partial = true
        }
      } else {
        await recorder.step('apply_extraction', 'skipped')
      }

      if (extraction?.afterUpdate) {
        try {
          await extraction.afterUpdate(leadId)
          await recorder.step('after_extraction', 'succeeded')
        } catch (afterErr) {
          console.error(`${logLabel} post-extraction update failed:`, afterErr)
          await recorder.step('after_extraction', 'failed', { error: afterErr })
          partial = true
        }
      } else {
        await recorder.step('after_extraction', 'skipped')
      }
    } else {
      await recorder.step('extract', 'skipped')
      await recorder.step('apply_extraction', 'skipped')
      await recorder.step('after_extraction', 'skipped')
    }

    const { data } = await supabase
      .from('leads')
      .select(selectColumns)
      .eq('id', leadId)
      .single()
    // `selectColumns` is a dynamic string, so the typed client can't infer the
    // row shape; coerce to the known SavedLeadRow.
    savedLead = data as unknown as SavedLeadRow | null
    await recorder.step('fetch_saved_lead', 'succeeded')

    // Link the lead to a customer (match or create), gated by feature switch.
    // Fail-open: linking never blocks or fails the lead pipeline.
    try {
      const linkingEnabled = await isFeatureEnabledForOrg(orgId, 'customer_linking')
      if (!linkingEnabled) {
        await recorder.step('link_customer', 'skipped')
      } else {
        const link = await linkCustomerForLead({
          orgId,
          name: savedLead?.name ?? null,
          phone: savedLead?.phone ?? null,
          email: savedLead?.email ?? null,
          address: savedLead?.address ?? null,
        })
        if (link.customerId) {
          const { error: linkErr } = await supabase
            .from('leads')
            .update({ customer_id: link.customerId })
            .eq('id', leadId)
          if (linkErr) {
            // No PII: message only. Do not set partial; linking is best-effort.
            await recorder.step('link_customer', 'failed', { error: linkErr.message })
          } else {
            await recorder.step('link_customer', 'succeeded', {
              output: { matched: link.matched, created: link.created, customer_id: link.customerId },
            })
          }
        } else {
          // Nothing to link (no contact info, or swallowed linker error).
          await recorder.step('link_customer', 'succeeded', {
            output: { matched: false, created: false, customer_id: null },
          })
        }
      }
    } catch (linkStepErr) {
      // Belt-and-braces: the linker swallows its own errors, but never let an
      // unexpected throw here disturb the rest of the pipeline.
      console.error(`${logLabel} customer linking failed:`, linkStepErr instanceof Error ? linkStepErr.message : String(linkStepErr))
      await recorder.step('link_customer', 'failed', {
        error: linkStepErr instanceof Error ? linkStepErr.message : String(linkStepErr),
      })
    }

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
      await recorder.step('notify_managers', 'succeeded')
    } catch (notifyErr) {
      console.error(`Manager notification failed for ${logLabel}:`, notifyErr)
      await recorder.step('notify_managers', 'failed', { error: notifyErr })
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
              source: followUp.source as 'sms' | 'email',
            })
          } else {
            hookbackSent = await sendMissedCallHookbackIfEnabled({
              orgId,
              leadId,
              toPhone,
              customerName: followUp.resolveCustomerName(ctx),
              source: followUp.source as 'phone' | '3cx_missed_call' | 'voicemail_email',
            })
            sent = hookbackSent
          }
          await recorder.step('follow_up_sms', 'succeeded', {
            output: { type: followUp.type, sent },
          })
        } catch (followUpErr) {
          console.error(`${logLabel} follow-up SMS failed:`, followUpErr)
          await recorder.step('follow_up_sms', 'failed', {
            error: followUpErr,
            output: { type: followUp.type, sent: false },
          })
          partial = true
        }
      } else {
        await recorder.step('follow_up_sms', 'skipped')
      }
    } else {
      await recorder.step('follow_up_sms', 'skipped')
    }
  } catch (postInsertErr) {
    console.error(`${logLabel} post-save processing error:`, postInsertErr)
    partial = true
  } finally {
    if (!runFinished) {
      await finishRun(partial ? 'partial' : 'succeeded')
    }
  }

  return { leadId, savedLead, hookbackSent, partial: partial || undefined }
}
