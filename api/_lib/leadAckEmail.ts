import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { sendTransactionalEmail } from './sendTransactionalEmail.js'
import { buildLeadAckEmailFromBrand } from './emailTemplates.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { LEAD_ACK_CALLBACK_WINDOW } from '../../shared/leadAckCopy.js'

export interface LeadAckEmailInput {
  orgId: string
  leadId: string
  toEmail: string
  customerName?: string | null
  source: string
}

function buildOrgPhoneBlock(supportPhone: string): string {
  if (!supportPhone) return ''
  return `<p>Need us urgently? Call <a href="tel:${supportPhone.replace(/\s/g, '')}">${supportPhone}</a>.</p>`
}

/** Send instant lead acknowledgement email when the feature switch is on (email-only leads). */
export async function sendLeadAckEmailIfEnabled(input: LeadAckEmailInput): Promise<boolean> {
  const ackEnabled = await isFeatureEnabledForOrg(input.orgId, 'lead_ack_email')
  if (!ackEnabled) return false

  const rawEmail = input.toEmail?.trim()
  if (!rawEmail) return false

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.error('Lead ack email failed: server not configured')
    return false
  }

  const { data: org } = await supabase
    .from('orgs')
    .select('name, brand_id, support_phone')
    .eq('id', input.orgId)
    .single()

  let emailTemplates: Record<string, string> | undefined
  if (org?.brand_id) {
    const { data: brandRow } = await supabase
      .from('brands')
      .select('email_templates')
      .eq('id', org.brand_id)
      .maybeSingle()
    emailTemplates = brandRow?.email_templates as Record<string, string> | undefined
  }

  const orgName = org?.name ?? 'Your organisation'
  const supportPhone = org?.support_phone?.trim() ?? ''
  const customerName = input.customerName?.trim() || 'there'

  const { subject, html } = buildLeadAckEmailFromBrand(emailTemplates, {
    'org.name': orgName,
    customerName,
    callbackWindow: LEAD_ACK_CALLBACK_WINDOW,
    orgPhoneBlock: buildOrgPhoneBlock(supportPhone),
  })

  const result = await sendTransactionalEmail({ to: rawEmail, subject, html })
  if (!result.sent) {
    console.error('Lead ack email failed:', result.message)
    return false
  }

  await supabase.from('lead_events').insert({
    lead_id: input.leadId,
    org_id: input.orgId,
    event_type: 'sms_sent',
    note: 'Lead acknowledgement email sent',
    payload: { source: input.source, channel: 'email' },
  })

  return true
}
