import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmployeeAlertToPhone } from './sendEmployeeAlert.js'

export type UnroutedChannel = 'sms' | 'call' | 'voicemail' | 'email' | 'facebook_lead'
export type UnroutedReason = 'no_mapping' | 'unknown_tag' | 'no_tag'

export interface CaptureUnroutedInboundInput {
  channel: UnroutedChannel
  identifier: string | null | undefined
  reason: UnroutedReason
  payload: unknown
}

/** Persist unrouted webhook payload and best-effort platform alert — never throws. */
export async function captureUnroutedInbound(
  supabase: SupabaseClient,
  input: CaptureUnroutedInboundInput
): Promise<void> {
  const { channel, identifier, reason, payload } = input
  const idLabel = identifier?.trim() || 'n/a'

  const { error: insertError } = await supabase.from('unrouted_inbound').insert({
    channel,
    identifier: identifier?.trim() || null,
    reason,
    payload,
  })

  if (insertError) {
    console.error('[UNROUTED_CAPTURE_FAILED]', {
      channel,
      identifier: idLabel,
      reason,
      error: insertError.message,
    })
    return
  }

  const alertPhone = process.env.PLATFORM_ALERT_PHONE?.trim()
  if (!alertPhone) return

  const smsBody = `Unrouted inbound ${channel} — ${idLabel} (${reason}). Captured for review.`

  try {
    const alertResult = await sendEmployeeAlertToPhone(alertPhone, smsBody, { body: smsBody })
    if (!alertResult.sent) {
      console.warn('[UNROUTED_ALERT_SKIPPED]', {
        channel,
        identifier: idLabel,
        reason,
        skipped: alertResult.skipped,
        error: alertResult.error,
      })
    }
  } catch (err) {
    console.error('[UNROUTED_ALERT_FAILED]', {
      channel,
      identifier: idLabel,
      reason,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
