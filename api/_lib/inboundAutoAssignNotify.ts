import type { SupabaseClient } from '@supabase/supabase-js'
import { buildEmployeeWhatsAppMessage } from './employeeWhatsAppTemplates.js'
import { notifyOrgUser } from './notifyUser.js'
import { sendEmployeeAlertWithSmsFallback } from './sendEmployeeAlert.js'
import { buildSmsFromBrand } from './smsTemplates.js'
import { getPlatformUrl } from './platformUrl.js'

export interface InboundAutoAssignNotifyInput {
  supabase: SupabaseClient
  orgId: string
  leadId: string
  assigneeId: string
  assigneeName: string
  leadName: string
  serviceType: string
  orgName: string
  smsTemplates?: Record<string, string> | null
}

/** Post-assign side effects for inbound team auto-assign. */
export async function notifyInboundAutoAssign(input: InboundAutoAssignNotifyInput): Promise<void> {
  const {
    supabase,
    orgId,
    leadId,
    assigneeId,
    assigneeName,
    leadName,
    serviceType,
    orgName,
    smsTemplates,
  } = input

  const platformUrl = getPlatformUrl()

  const { error: eventError } = await supabase.from('lead_events').insert({
    lead_id: leadId,
    org_id: orgId,
    event_type: 'assigned',
    note: `Lead auto-assigned to ${assigneeName}`,
    payload: {
      assigned_to: assigneeId,
      source: 'inbound_auto_assign',
    },
  })

  if (eventError) {
    console.error('Inbound auto-assign event failed:', eventError.message)
  }

  await notifyOrgUser({
    supabase,
    orgId,
    userId: assigneeId,
    title: 'New Lead Assigned',
    message: `You've been assigned: ${leadName} — ${serviceType}`,
    url: `${platformUrl}/leads`,
    type: 'lead_assigned',
    leadId,
  })

  const { data: assignee } = await supabase
    .from('profiles')
    .select('phone')
    .eq('id', assigneeId)
    .maybeSingle()

  if (!assignee?.phone?.trim()) return

  const smsBody = buildSmsFromBrand(
    smsTemplates,
    'tech_assignment',
    {
      'org.name': orgName,
      leadName,
      serviceType,
      appUrl: `${platformUrl}/leads`,
    },
    `${orgName}: You've been assigned {{leadName}} ({{serviceType}}). Open the app: {{appUrl}}`
  )

  const whatsAppMessage = buildEmployeeWhatsAppMessage('tech_assignment', smsBody, {
    orgName,
    leadName,
    serviceType,
    appUrl: `${platformUrl}/leads`,
  })

  try {
    await sendEmployeeAlertWithSmsFallback({
      toPhone: assignee.phone,
      smsBody,
      whatsAppMessage,
    })
  } catch (err) {
    console.error('Inbound auto-assign WhatsApp failed (non-fatal):', err)
  }
}
