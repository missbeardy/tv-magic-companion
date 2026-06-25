import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { sendBrandedSms } from './sendBrandedSms.js'
import { MISSED_CALL_HOOKBACK_FALLBACK } from '../../src/lib/missedCallHookback.js'

export interface MissedCallHookbackInput {
  orgId: string
  leadId: string
  toPhone: string
  customerName?: string | null
  source: '3cx_missed_call' | 'phone' | 'voicemail_email'
}

/** Send missed-call auto-reply SMS when the feature switch is on (first lead only — caller dedupes upstream). */
export async function sendMissedCallHookbackIfEnabled(
  input: MissedCallHookbackInput
): Promise<boolean> {
  const hookbackEnabled = await isFeatureEnabledForOrg(input.orgId, 'missed_call_hookback_sms')
  if (!hookbackEnabled) return false

  const customerName = input.customerName?.trim() || 'there'
  const result = await sendBrandedSms({
    orgId: input.orgId,
    toPhone: input.toPhone,
    templateKey: 'missed_call_hookback',
    vars: { customerName },
    fallbackMessage: MISSED_CALL_HOOKBACK_FALLBACK,
    leadId: input.leadId,
    eventType: 'sms_sent',
    eventNote: 'Missed call auto-reply SMS sent',
    eventPayload: { source: input.source },
  })

  if (result.error) {
    console.error('Missed call hookback SMS failed:', result.error)
  }

  return result.sent
}
