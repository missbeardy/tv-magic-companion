import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyManagersNewLead } from './notifyManagersNewLead.js'
import { sendLeadAckSmsIfEnabled } from './leadAckSms.js'
import { sendMissedCallHookbackIfEnabled } from './missedCallHookbackSms.js'
import {
  updateLeadFromExtraction,
  type ExtractedLeadFields,
} from './rawFirstLead.js'

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
  } = input

  const { id: leadId } = await insertLead()

  let extraction: ProcessInboundLeadExtractionResult | null = null
  let savedLead: SavedLeadRow | null = null
  let hookbackSent = false
  let partial = false

  try {
    await supabase.from('lead_events').insert({
      lead_id: leadId,
      org_id: orgId,
      event_type: 'created',
      note: createdEvent.note,
      payload: createdEvent.payload,
    })

    if (extract) {
      extraction = (await extract(leadId)) ?? null

      if (extraction?.updateFields) {
        try {
          await updateLeadFromExtraction(supabase, leadId, extraction.updateFields)
        } catch (updateErr) {
          console.error(`${logLabel} extraction update failed:`, updateErr)
          partial = true
        }
      }

      if (extraction?.afterUpdate) {
        try {
          await extraction.afterUpdate(leadId)
        } catch (afterErr) {
          console.error(`${logLabel} post-extraction update failed:`, afterErr)
          partial = true
        }
      }
    }

    const { data } = await supabase
      .from('leads')
      .select(selectColumns)
      .eq('id', leadId)
      .single()
    savedLead = data

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
    } catch (notifyErr) {
      console.error(`Manager notification failed for ${logLabel}:`, notifyErr)
      partial = true
    }

    if (followUp) {
      const toPhone = followUp.resolvePhone(ctx)
      if (toPhone) {
        try {
          if (followUp.type === 'ack') {
            await sendLeadAckSmsIfEnabled({
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
          }
        } catch (followUpErr) {
          console.error(`${logLabel} follow-up SMS failed:`, followUpErr)
          partial = true
        }
      }
    }
  } catch (postInsertErr) {
    console.error(`${logLabel} post-save processing error:`, postInsertErr)
    partial = true
  }

  return { leadId, savedLead, hookbackSent, partial: partial || undefined }
}
