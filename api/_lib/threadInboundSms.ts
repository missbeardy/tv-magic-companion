import type { SupabaseClient } from '@supabase/supabase-js'
import { findOpenLeadByPhone } from './inboundLeadDedup.js'
import { insertTrustedCustomerReply } from './notifyUser.js'
import { formatAuPhoneForSms } from './phone.js'
import { getPlatformUrl } from './platformUrl.js'
import { startWorkflowRun } from './workflowRun.js'

export interface ThreadInboundSmsInput {
  supabase: SupabaseClient
  orgId: string
  fromNumber: string
  smsText: string
  toNumber: string
}

/** Attach an inbound SMS to an existing open lead instead of creating a new one. */
export async function threadInboundSms(
  input: ThreadInboundSmsInput
): Promise<{ leadId: string } | null> {
  const lead = await findOpenLeadByPhone(input.supabase, input.fromNumber, input.orgId)
  if (!lead) return null

  const phone = formatAuPhoneForSms(input.fromNumber)
  const preview = input.smsText.trim().slice(0, 280)

  const { error: eventError } = await input.supabase.from('lead_events').insert({
    lead_id: lead.id,
    org_id: input.orgId,
    event_type: 'sms_received',
    note: preview,
    payload: {
      channel: 'sms',
      phone,
      inbound: true,
      to: input.toNumber,
    },
  })
  if (eventError) {
    console.error('sms_received event failed:', eventError.message)
  }

  await input.supabase
    .from('leads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', lead.id)
    .eq('org_id', input.orgId)

  if (lead.assigned_to) {
    await insertTrustedCustomerReply({
      supabase: input.supabase,
      orgId: input.orgId,
      userId: lead.assigned_to,
      title: 'Customer replied by SMS',
      message: preview || 'New SMS from the customer',
      url: `${getPlatformUrl()}/leads`,
      leadId: lead.id,
    })
  }

  const recorder = await startWorkflowRun(input.supabase, {
    workflowKey: 'inbound_lead',
    orgId: input.orgId,
    triggerChannel: 'sms',
    triggerSummary: { source: 'sms', threaded: true, leadId: lead.id },
  })
  await recorder.attachLead(lead.id)
  await recorder.step('thread_existing', 'succeeded', { output: { leadId: lead.id } })
  await recorder.finish('succeeded')

  return { leadId: lead.id }
}
