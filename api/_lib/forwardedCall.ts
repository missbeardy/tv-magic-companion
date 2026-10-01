// T1.20 — provider-neutral entry for a call the tradie's mobile diverted to a
// FieldBourne answering line (GSM **61 / **67 / **62). Each voice provider's webhook
// adapter (Crazytel, Twilio) parses its own payload into a ForwardedCallEvent and hands
// it here; everything from org routing onward is shared with the 3CX voicemail path.
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOrgIdFromDid } from './resolveOrgFromDid.js'
import { captureUnroutedInbound } from './captureUnroutedInbound.js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import {
  processVoicemail,
  type VoicemailAudio,
  type VoicemailMetadata,
  type VoicemailResult,
} from './processVoicemail.js'
import { maskPhone } from './redact.js'
import { log } from './log.js'

export type VoiceProvider = 'crazytel' | 'twilio'

export interface ForwardedCallEvent {
  provider: VoiceProvider
  /** Stable per call (not per webhook delivery) so provider retries collapse to one lead. */
  dedupKey: string
  /** The answering line the call was diverted to — routes to the org. */
  calledNumber: string
  /** Original caller CLI (AU diverts preserve it); null when withheld. */
  callerPhone: string | null
  receivedAt: string | null
  durationSec: number | null
  /** Lazily fetched so a hang-up never touches the provider's media API. */
  audio: { fetch: () => Promise<VoicemailAudio> } | null
  /** Caller hung up before leaving a message. */
  noMessage: boolean
  /** Raw payload, kept only for the unrouted-inbound trail. */
  raw?: unknown
}

export type ForwardedCallOutcome =
  | { outcome: 'unrouted' }
  | { outcome: 'disabled'; orgId: string }
  | { outcome: 'processed'; orgId: string; result: VoicemailResult; audioStored: boolean }

export async function handleForwardedCall(
  supabase: SupabaseClient,
  event: ForwardedCallEvent
): Promise<ForwardedCallOutcome> {
  const resolution = await resolveOrgIdFromDid(supabase, event.calledNumber)
  if (!resolution.orgId) {
    await captureUnroutedInbound(supabase, {
      channel: 'call',
      identifier: event.calledNumber,
      reason: 'no_mapping',
      payload: { provider: event.provider, dedupKey: event.dedupKey, raw: event.raw ?? null },
    })
    return { outcome: 'unrouted' }
  }
  const orgId = resolution.orgId

  if (!(await isFeatureEnabledForOrg(orgId, 'inbound_calls'))) {
    log.info('Forwarded call ignored — inbound_calls off', { orgId, provider: event.provider })
    return { outcome: 'disabled', orgId }
  }

  // A failed download must not cost the lead: the caller's number alone is worth a
  // call back, and processVoicemail records the missing audio as a failed transcription.
  let audio: VoicemailAudio | null = null
  if (event.audio && !event.noMessage) {
    try {
      audio = await event.audio.fetch()
    } catch (err) {
      console.error(`Forwarded-call audio fetch failed (${event.provider}):`, err)
    }
  }

  const metadata: VoicemailMetadata = {
    phone: event.callerPhone?.trim() || 'Unknown',
    calledNumber: event.calledNumber,
    receivedAt: event.receivedAt,
    duration: event.durationSec != null ? String(event.durationSec) : null,
    extensionName: null,
    fileRef: null,
  }

  log.info('Forwarded call', {
    orgId,
    provider: event.provider,
    caller: maskPhone(event.callerPhone),
    noMessage: event.noMessage,
    hasAudio: Boolean(audio),
  })

  const result = await processVoicemail({
    supabase,
    orgId,
    bodyText: '',
    subject: event.noMessage ? 'Missed call' : 'Voicemail',
    from: event.callerPhone ?? 'Unknown',
    messageId: null,
    audio,
    source: 'call_forward',
    metadata,
    dedupKey: event.dedupKey,
    noMessage: event.noMessage,
    triggerIdentifier: event.calledNumber,
  })

  return { outcome: 'processed', orgId, result, audioStored: Boolean(audio) }
}
