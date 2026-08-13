// Shared voicemail pipeline, transport-neutral so both the CloudMailin webhook
// and the IMAP poller run identical logic.
//
// Why the poller exists: CloudMailin rejects any forwarded message over 524,288
// bytes. 3CX records PCM mono 8 kHz 16-bit (16 KB/sec), which base64-encodes to
// ~1.33×, so anything past roughly 25 seconds of speech bounces and the lead is
// never created. The original mail is still in the mailbox, so we read it there.
import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatAuPhoneForSms } from './phone.js'
import { findRecentLeadByPhone } from './inboundLeadDedup.js'
import { processInboundLead } from './processInboundLead.js'
import { extractFromVoicemailTranscript, type ExtractionStatus } from './extractLead.js'
import { insertRawFirstLead, type ExtractedLeadFields } from './rawFirstLead.js'
import {
  canEnrichLeadFromVoicemail,
  enrichLeadFromVoicemailTranscript,
} from './retryLeadExtraction.js'

export const VOICEMAIL_BUCKET = 'lead-voicemails'

export const VOICEMAIL_AUDIO_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
]
export const VOICEMAIL_AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.ogg']

/** Whisper rejects anything larger; a 5-minute 3CX recording is only ~4.8 MB. */
export const MAX_VOICEMAIL_BYTES = 25 * 1024 * 1024

export function isVoicemailAudio(contentType?: string | null, fileName?: string | null): boolean {
  const type = (contentType || '').toLowerCase()
  const name = (fileName || '').toLowerCase()
  return (
    VOICEMAIL_AUDIO_TYPES.some((t) => type.includes(t)) ||
    VOICEMAIL_AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext))
  )
}

export interface VoicemailMetadata {
  phone: string
  calledNumber: string | null
  receivedAt: string | null
  duration: string | null
  extensionName: string | null
  fileRef: string | null
}

/**
 * Parse the 3CX notification body. The shape is machine-generated and stable:
 *
 *   From: 0400000000
 *   To: "166" - "TV Magic VM" ""
 *   Received:"Monday, July 27, 2026 11:55:14 AM"
 *   Duration:"00:00:26"
 *   File:"vmail_0400000000_166_20260727015014"
 */
export function extractVoicemailMetadata(subject: string, body: string): VoicemailMetadata {
  const fromMatch = body.match(/From:\s*([\d\s()+-]+)/i)
  const subjectMatch = subject.match(/New Voicemail from ([\d\s()+-]+)/i)
  const receivedMatch = body.match(/Received:\s*"([^"]+)"/i)
  const durationMatch = body.match(/Duration:\s*"([^"]+)"/i)
  const toMatch = body.match(/To:\s*"([^"]+)"\s*-\s*"([^"]+)"/i)
  const fileMatch = body.match(/File:\s*"([^"]+)"/i)

  return {
    phone: (fromMatch?.[1] || subjectMatch?.[1] || 'Unknown').trim(),
    calledNumber: toMatch?.[1]?.trim() || null,
    receivedAt: receivedMatch?.[1]?.trim() || null,
    duration: durationMatch?.[1]?.trim() || null,
    extensionName: toMatch?.[2]?.trim() || null,
    fileRef: fileMatch?.[1]?.trim() || null,
  }
}

/**
 * Storage-safe MIME type for the recording.
 *
 * 3CX attaches the WAV as `application/octet-stream`, which the lead-voicemails bucket
 * rejects because its allowed_mime_types lists real audio types only. Detection already
 * relies on the filename (isVoicemailAudio), so derive the stored type the same way
 * rather than trusting a generic declaration. Measured: the bytes really are RIFF PCM.
 */
export function normaliseAudioContentType(
  declared: string | null | undefined,
  fileName: string | null | undefined
): string {
  const type = (declared || '').toLowerCase().trim()
  if (VOICEMAIL_AUDIO_TYPES.includes(type)) return type

  const name = (fileName || '').toLowerCase()
  if (name.endsWith('.mp3')) return 'audio/mpeg'
  if (name.endsWith('.m4a')) return 'audio/mp4'
  if (name.endsWith('.ogg')) return 'audio/ogg'
  return 'audio/wav'
}

/**
 * Does this actually look like a 3CX voicemail notification?
 *
 * The poller trusts the Gmail label rather than a subject match, so anything else
 * that lands in that label reaches us. Without this guard a stray email carrying any
 * audio attachment would parse to `phone: 'Unknown'` and create a junk "Missed Call"
 * lead. Requires the machine-generated `File:` reference or a usable caller number.
 */
export function looksLikeVoicemailNotification(subject: string, body: string): boolean {
  const metadata = extractVoicemailMetadata(subject, body)
  return Boolean(metadata.fileRef) || metadata.phone !== 'Unknown'
}

/**
 * Dedup key shared by both transports.
 *
 * 3CX's `File:` reference is the primary key — it lives in the message BODY, which
 * both transports parse identically, and it already encodes caller, extension and
 * timestamp (`vmail_0400000000_166_20260727015014`).
 *
 * Message-ID is deliberately NOT preferred. It is only visible to whichever transport
 * can see the headers: CloudMailin does not forward one, so in production on
 * 13-08-2026 the webhook fell back to the synthetic hash while the poller used the
 * real RFC Message-ID. Different keys for the same voicemail meant the UNIQUE
 * constraint never fired and the customer got two leads.
 */
export function voicemailDedupKey(
  messageId: string | null | undefined,
  metadata: VoicemailMetadata
): string {
  if (metadata.fileRef) return `vmail:${metadata.fileRef}`

  const trimmed = messageId?.trim()
  if (trimmed) return trimmed

  const basis = [metadata.phone, metadata.receivedAt ?? '', metadata.duration ?? ''].join('|')
  return `synthetic:${createHash('sha256').update(basis).digest('hex')}`
}

export async function transcribeAudio(buffer: Buffer, fileName: string): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(buffer)]), fileName || 'voicemail.wav')
  form.append('model', 'whisper-1')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Whisper API error: ${res.status} — ${errText}`)
  }

  const data = (await res.json()) as { text: string }
  return data.text || ''
}

export interface VoicemailAudio {
  buffer: Buffer
  fileName: string
  contentType: string
}

export interface VoicemailInput {
  supabase: SupabaseClient
  orgId: string
  bodyText: string
  subject: string
  from: string
  /** RFC 5322 Message-ID; falls back to a synthetic key when absent. */
  messageId: string | null
  audio: VoicemailAudio | null
  source: 'cloudmailin' | 'imap_poll'
  /** Platform simulator hook — bypasses Whisper. */
  simulatedTranscript?: string
  /** Routing identifier recorded on the workflow run (plus-tag or DID). */
  triggerIdentifier?: string | null
}

export type VoicemailResult =
  | { outcome: 'already_processed'; dedupKey: string }
  | { outcome: 'enriched_existing'; leadId: string; extractionStatus: string }
  | { outcome: 'logged_to_existing'; leadId: string }
  | { outcome: 'created'; leadId: string; hookbackSent?: boolean; partial?: boolean; transcriptionFailed: boolean }

interface VoicemailClaim {
  id: string
  storagePath: string | null
}

/**
 * Claim the message by inserting the `lead_voicemails` row up front. The UNIQUE
 * constraint on rfc_message_id *is* the mutual exclusion: a 5-minute poll can
 * overlap the instant webhook, and a SELECT-then-INSERT would leave a race
 * window in which both paths create a lead. Whoever loses the insert backs off.
 *
 * Claiming before transcription also means a Whisper failure still leaves a
 * playable recording attached to the lead, which the old flow discarded.
 */
async function claimVoicemail(
  supabase: SupabaseClient,
  input: VoicemailInput,
  metadata: VoicemailMetadata,
  dedupKey: string,
  callerPhone: string | null
): Promise<VoicemailClaim | null> {
  const storagePath = input.audio ? `${input.orgId}/${randomUUID()}.wav` : null

  const { data, error } = await supabase
    .from('lead_voicemails')
    .insert({
      org_id: input.orgId,
      lead_id: null,
      storage_path: storagePath,
      mime_type: input.audio
        ? normaliseAudioContentType(input.audio.contentType, input.audio.fileName)
        : null,
      file_name: input.audio?.fileName ?? metadata.fileRef ?? null,
      byte_size: input.audio?.buffer.length ?? null,
      duration_text: metadata.duration,
      received_text: metadata.receivedAt,
      caller_phone: callerPhone,
      rfc_message_id: dedupKey,
      source: input.source,
      transcription_status: 'pending',
    })
    .select('id, storage_path')
    .single()

  if (error) {
    // 23505 = unique_violation → the other transport already has this message.
    if (error.code === '23505') return null
    throw error
  }

  return { id: data.id, storagePath: data.storage_path }
}

export async function processVoicemail(input: VoicemailInput): Promise<VoicemailResult> {
  const { supabase, orgId, bodyText, subject, from } = input

  const metadata = extractVoicemailMetadata(subject, bodyText)
  const dedupKey = voicemailDedupKey(input.messageId, metadata)

  const rawPhone = metadata.phone
  const normalizedPhone =
    rawPhone && rawPhone !== 'Unknown' ? formatAuPhoneForSms(rawPhone) : null

  if (input.audio && input.audio.buffer.length > MAX_VOICEMAIL_BYTES) {
    throw new Error(
      `Voicemail audio ${input.audio.buffer.length} bytes exceeds the ${MAX_VOICEMAIL_BYTES}-byte limit`
    )
  }

  const claim = await claimVoicemail(supabase, input, metadata, dedupKey, normalizedPhone)
  if (!claim) {
    return { outcome: 'already_processed', dedupKey }
  }

  // Store the audio before transcription, so a Whisper failure still leaves something
  // playable. A storage failure must NOT be fatal: losing the recording is bad, but
  // losing the lead is the exact failure this whole change exists to prevent — and an
  // upload problem previously took down the short-voicemail CloudMailin path too.
  if (input.audio && claim.storagePath) {
    const { error: uploadErr } = await supabase.storage
      .from(VOICEMAIL_BUCKET)
      .upload(claim.storagePath, input.audio.buffer, {
        contentType: normaliseAudioContentType(input.audio.contentType, input.audio.fileName),
        upsert: false,
      })

    if (uploadErr) {
      console.error(
        `Voicemail upload failed (${uploadErr.message}) — continuing without the recording`
      )
      await supabase.from('lead_voicemails').update({ storage_path: null }).eq('id', claim.id)
      claim.storagePath = null
    }
  }

  const callInfo = `Call received: ${metadata.receivedAt || 'time unknown'} (${metadata.duration || '?'}s)${
    metadata.extensionName ? ` via ${metadata.extensionName}` : ''
  }`

  let transcriptionFailed = false
  let transcript = ''

  if (input.simulatedTranscript) {
    transcript = input.simulatedTranscript
  } else if (input.audio) {
    try {
      transcript = await transcribeAudio(input.audio.buffer, input.audio.fileName)
    } catch (transcribeErr) {
      console.error('Voicemail transcription failed:', transcribeErr)
      transcriptionFailed = true
    }
  } else {
    transcriptionFailed = true
  }

  await supabase
    .from('lead_voicemails')
    .update({ transcription_status: transcriptionFailed ? 'failed' : 'succeeded' })
    .eq('id', claim.id)

  const attachToLead = async (leadId: string) => {
    await supabase.from('lead_voicemails').update({ lead_id: leadId }).eq('id', claim.id)
  }

  if (normalizedPhone) {
    const existingLead = await findRecentLeadByPhone(supabase, normalizedPhone, orgId)
    if (existingLead) {
      await attachToLead(existingLead.id)

      if (!transcriptionFailed && transcript.trim() && canEnrichLeadFromVoicemail(existingLead)) {
        const enriched = await enrichLeadFromVoicemailTranscript(
          supabase,
          {
            id: existingLead.id,
            org_id: orgId,
            source: 'phone',
            name: existingLead.name,
            phone: normalizedPhone,
            raw_sms: null,
            raw_email: transcript,
            extraction_status: existingLead.extraction_status,
          },
          transcript,
          { subject, from, callInfo }
        )
        return {
          outcome: 'enriched_existing',
          leadId: existingLead.id,
          extractionStatus: enriched.status,
        }
      }

      await supabase.from('lead_events').insert({
        lead_id: existingLead.id,
        org_id: orgId,
        event_type: 'missed_call_again',
        note: `Another voicemail from ${normalizedPhone}`,
        payload: { source: 'phone', transcription_failed: transcriptionFailed },
      })
      return { outcome: 'logged_to_existing', leadId: existingLead.id }
    }
  }

  const result = await processInboundLead({
    supabase,
    orgId,
    insertLead: () =>
      insertRawFirstLead(supabase, orgId, {
        org_id: orgId,
        name: 'Missed Call',
        phone: normalizedPhone || rawPhone,
        email: null,
        service_type: 'General Enquiry',
        details: `Voicemail received — processing. ${callInfo}`,
        address: null,
        source: 'phone',
        raw_email: bodyText,
      }),
    createdEvent: {
      note: 'Lead captured from inbound voicemail email (raw-first)',
      payload: { source: 'phone', voicemail_source: input.source },
    },
    extract: async () => {
      let extracted: ExtractedLeadFields = {}
      let extractionStatus: ExtractionStatus = 'failed'

      if (!transcriptionFailed && transcript.trim()) {
        const runResult = await extractFromVoicemailTranscript(transcript, subject, from)
        extracted = runResult.fields
        extractionStatus = runResult.status
      }

      const fallbackDetails = transcriptionFailed
        ? `Voicemail received — transcription failed, the recording is attached to this lead. ${callInfo}`
        : transcript.trim()
          ? `Voicemail transcript: ${transcript}\n\n${callInfo}`
          : `Missed call voicemail received. ${callInfo}`

      const details = extracted.details
        ? `${extracted.details}\n\nFull transcript: ${transcript}\n\n${callInfo}`
        : fallbackDetails

      return {
        updateFields: {
          name: extracted.name || 'Missed Call',
          phone: extracted.phone || normalizedPhone || rawPhone,
          email: extracted.email,
          service_type: extracted.service_type || 'General Enquiry',
          details,
          address: extracted.address,
        },
        extractionStatus: transcriptionFailed ? 'failed' : extractionStatus,
        afterUpdate: transcript
          ? async (leadId) => {
              await supabase.from('leads').update({ raw_email: transcript }).eq('id', leadId)
            }
          : undefined,
      }
    },
    selectColumns: 'id, name, service_type, phone, status, email, address',
    buildNotify: ({ savedLead }) => ({
      name: savedLead?.name || 'Missed Call',
      service_type: savedLead?.service_type || 'General Enquiry',
      status: savedLead?.status || 'unassigned',
    }),
    followUp: {
      type: 'hookback',
      source: 'voicemail_email',
      resolvePhone: ({ savedLead }) =>
        savedLead?.phone ? formatAuPhoneForSms(String(savedLead.phone)) : normalizedPhone,
      resolveCustomerName: ({ savedLead }) => savedLead?.name || 'there',
    },
    logLabel: 'voicemail email',
    run: {
      workflowKey: 'inbound_lead',
      triggerChannel: 'voicemail',
      triggerSummary: {
        identifier: input.triggerIdentifier ?? metadata.calledNumber,
        source: 'phone',
        transport: input.source,
      },
    },
  })

  await attachToLead(result.leadId)

  return {
    outcome: 'created',
    leadId: result.leadId,
    hookbackSent: result.hookbackSent,
    partial: result.partial,
    transcriptionFailed,
  }
}
