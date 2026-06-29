import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { sendBrandedSms } from './sendBrandedSms.js'
import { formatAuPhoneForSms } from './phone.js'

const LEAD_ACK_FALLBACK =
  "Hi {{customerName}}, thanks for contacting {{org.name}}. We've received your enquiry and will be in touch soon."

export interface LeadAckSmsInput {
  orgId: string
  leadId: string
  toPhone: string
  customerName?: string | null
  source: 'sms' | 'email'
}

/** Send instant lead acknowledgement SMS when the feature switch is on. */
export async function sendLeadAckSmsIfEnabled(input: LeadAckSmsInput): Promise<boolean> {
  const ackEnabled = await isFeatureEnabledForOrg(input.orgId, 'lead_ack_sms')
  if (!ackEnabled) return false

  const rawPhone = input.toPhone?.trim()
  if (!rawPhone) return false

  const customerName = input.customerName?.trim() || 'there'
  const result = await sendBrandedSms({
    orgId: input.orgId,
    toPhone: formatAuPhoneForSms(rawPhone),
    templateKey: 'lead_ack_sms',
    vars: { customerName },
    fallbackMessage: LEAD_ACK_FALLBACK,
    leadId: input.leadId,
    eventType: 'sms_sent',
    eventNote: 'Lead acknowledgement SMS sent',
    eventPayload: { source: input.source },
  })

  if (result.error) {
    console.error('Lead ack SMS failed:', result.error)
  }

  return result.sent
}
