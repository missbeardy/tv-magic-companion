// FieldBourne ops forwards admin@fieldbourne → CloudMailin plus-address; tag resolves org.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import './_lib/loadLocalEnv.js'
import { createClient } from '@supabase/supabase-js'
import { isFeatureEnabledForOrg } from './_lib/featureSwitches.js'
import { resolveOrgIdFromInboundEmail, resolveOrgIdFromCloudmailinWebhook } from './_lib/resolveOrgFromInboundEmail.js'
import { captureUnroutedInbound } from './_lib/captureUnroutedInbound.js'
import { findRecentLeadByPhone } from './_lib/inboundLeadDedup.js'
import { formatAuPhoneForSms } from './_lib/phone.js'
import { processInboundLead } from './_lib/processInboundLead.js'
import {
  emailFallbackParse,
  insertRawFirstLead,
  parseEmailSender,
  type ExtractedLeadFields,
} from './_lib/rawFirstLead.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VOICEMAIL_AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3']
const VOICEMAIL_AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.ogg']

interface VoicemailMetadata {
  phone: string
  calledNumber: string | null
  receivedAt: string | null
  duration: string | null
  extensionName: string | null
}

function extractVoicemailMetadata(subject: string, body: string): VoicemailMetadata {
  const fromMatch = body.match(/From:\s*([\d\s()+-]+)/i)
  const subjectMatch = subject.match(/New Voicemail from ([\d\s()+-]+)/i)
  const receivedMatch = body.match(/Received:\s*"([^"]+)"/i)
  const durationMatch = body.match(/Duration:\s*"([^"]+)"/i)
  const toMatch = body.match(/To:\s*"([^"]+)"\s*-\s*"([^"]+)"/i)

  return {
    phone: (fromMatch?.[1] || subjectMatch?.[1] || 'Unknown').trim(),
    calledNumber: toMatch?.[1]?.trim() || null,
    receivedAt: receivedMatch?.[1]?.trim() || null,
    duration: durationMatch?.[1]?.trim() || null,
    extensionName: toMatch?.[2]?.trim() || null,
  }
}

interface CloudmailinAttachment {
  file_name?: string
  content_type?: string
  content?: string
  url?: string
  size?: number
}

function isVoicemailAttachment(att: CloudmailinAttachment): boolean {
  const type = (att.content_type || '').toLowerCase()
  const name = (att.file_name || '').toLowerCase()
  return (
    VOICEMAIL_AUDIO_TYPES.some((t) => type.includes(t)) ||
    VOICEMAIL_AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext))
  )
}

async function transcribeAudio(buffer: Buffer, fileName: string): Promise<string> {
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

async function extractLeadWithClaude(
  sourceText: string,
  subject: string,
  from: string,
  context: 'email' | 'voicemail'
) {
  const prompt =
    context === 'voicemail'
      ? `This is an automated transcript of a voicemail left by a customer who called a TV aerial/satellite installation business and missed reaching anyone. The transcript may contain transcription errors — use your best judgement. Return ONLY a JSON object, no markdown, no code fences.

Fields:
- name: full name (or null)
- phone: phone number if mentioned in the transcript (or null)
- email: email address if mentioned (or null)
- service_type: type of service requested (e.g. "TV Aerial", "Satellite", "MATV", "General Enquiry")
- details: brief summary of what they need (1-2 sentences)
- address: street address if mentioned (or null)

Voicemail transcript: ${sourceText}`
      : `Extract lead information from this email and return ONLY a JSON object, no markdown, no code fences.

Fields:
- name: full name (or null)
- phone: phone number (or null)
- email: email address
- service_type: type of service requested (e.g. "TV Aerial", "Satellite", "MATV", "General Enquiry")
- details: brief summary of their request (1-2 sentences)
- address: street address if mentioned (or null)

Email From: ${from}
Subject: ${subject}
Body: ${sourceText}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`)

  const result = (await res.json()) as { content: Array<{ type: string; text: string }> }
  const raw = result.content[0]?.type === 'text' ? result.content[0].text : ''
  const clean = raw.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { secret } = req.query
  if (secret !== process.env.INBOUND_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { plain, html, headers, attachments } = req.body as {
    plain?: string
    html?: string
    headers?: Record<string, string>
    attachments?: CloudmailinAttachment[]
  }

  const emailText = plain || html?.replace(/<[^>]+>/g, ' ') || ''
  const subject = req.body.subject || headers?.subject || 'No Subject'
  const from = req.body.from || headers?.from || 'Unknown Sender'
  const simulatedTranscript =
    typeof (req.body as Record<string, unknown>).simulated_transcript === 'string'
      ? String((req.body as Record<string, unknown>).simulated_transcript).trim()
      : ''

  // ── Voicemail branch ──────────────────────────────────────────
  const voicemailAttachment = attachments?.find(isVoicemailAttachment)

  if (voicemailAttachment) {
    const metadataPreview = extractVoicemailMetadata(subject, emailText)
    const orgResolution = await resolveOrgIdFromCloudmailinWebhook(
      supabase,
      req.body,
      metadataPreview.calledNumber
    )
    if (orgResolution.source === 'unresolved') {
      console.error(`Voicemail email: org not resolved (${orgResolution.reason})`)
      await captureUnroutedInbound(supabase, {
        channel: 'voicemail',
        identifier: orgResolution.tag ?? metadataPreview.calledNumber,
        reason:
          orgResolution.reason === 'no_tag' || orgResolution.reason === 'unknown_tag'
            ? orgResolution.reason
            : 'no_mapping',
        payload: req.body,
      })
      return res.status(200).json({ skipped: true, reason: 'no_org' })
    }
    const orgId = orgResolution.orgId

    const callsEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_calls')
    if (!callsEnabled) {
      console.log(`Inbound calls/voicemail disabled for org ${orgId}`)
      return res.status(200).json({ skipped: true, reason: 'inbound_calls_disabled' })
    }

    try {
      const metadata = extractVoicemailMetadata(subject, emailText)
      const callInfo = `Call received: ${metadata.receivedAt || 'time unknown'} (${metadata.duration || '?'}s)${
        metadata.extensionName ? ` via ${metadata.extensionName}` : ''
      }`

      const rawPhone = metadata.phone
      const normalizedPhone = rawPhone && rawPhone !== 'Unknown'
        ? formatAuPhoneForSms(rawPhone)
        : null

      if (normalizedPhone) {
        const existingLead = await findRecentLeadByPhone(supabase, normalizedPhone, orgId)
        if (existingLead) {
          await supabase.from('lead_events').insert({
            lead_id: existingLead.id,
            org_id: orgId,
            event_type: 'missed_call_again',
            note: `Another voicemail from ${normalizedPhone}`,
            payload: { source: 'phone', transcription_failed: false },
          })
          return res.status(200).json({
            success: true,
            action: 'logged_to_existing',
            lead_id: existingLead.id,
            type: 'voicemail',
          })
        }
      }

      let transcriptionFailed = false

      let result
      try {
        result = await processInboundLead({
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
              raw_email: emailText,
            }),
          createdEvent: {
            note: 'Lead captured from inbound voicemail email (raw-first)',
            payload: { source: 'phone' },
          },
          extract: async () => {
            let transcript = ''

            if (simulatedTranscript) {
              transcript = simulatedTranscript
            } else {
              try {
                if (voicemailAttachment.content) {
                  const buffer = Buffer.from(voicemailAttachment.content, 'base64')
                  transcript = await transcribeAudio(buffer, voicemailAttachment.file_name || 'voicemail.wav')
                } else if (voicemailAttachment.url) {
                  const audioRes = await fetch(voicemailAttachment.url)
                  const buffer = Buffer.from(await audioRes.arrayBuffer())
                  transcript = await transcribeAudio(buffer, voicemailAttachment.file_name || 'voicemail.wav')
                } else {
                  throw new Error('No attachment content or url present')
                }
              } catch (transcribeErr) {
                console.error('Voicemail transcription failed:', transcribeErr)
                transcriptionFailed = true
              }
            }

            let extracted: ExtractedLeadFields = {}
            if (!transcriptionFailed && transcript.trim()) {
              try {
                extracted = await extractLeadWithClaude(transcript, subject, from, 'voicemail')
              } catch (claudeErr) {
                console.error('Claude voicemail extraction failed:', claudeErr)
              }
            }

            const fallbackDetails = transcriptionFailed
              ? `Voicemail received — transcription failed, please check 3CX manually. ${callInfo}`
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
              afterUpdate: transcript
                ? async (leadId) => {
                    await supabase.from('leads').update({ raw_email: transcript }).eq('id', leadId)
                  }
                : undefined,
            }
          },
          selectColumns: 'id, name, service_type, phone, status',
          buildNotify: ({ savedLead }) => ({
            name: savedLead?.name || 'Missed Call',
            service_type: savedLead?.service_type || 'General Enquiry',
            status: savedLead?.status || 'unassigned',
          }),
          followUp: {
            type: 'hookback',
            source: 'voicemail_email',
            resolvePhone: ({ savedLead }) =>
              savedLead?.phone
                ? formatAuPhoneForSms(String(savedLead.phone))
                : normalizedPhone,
            resolveCustomerName: ({ savedLead }) => savedLead?.name || 'there',
          },
          logLabel: 'voicemail email',
          run: {
            workflowKey: 'inbound_lead',
            triggerChannel: 'voicemail',
            triggerSummary: {
              identifier: orgResolution.tag ?? metadataPreview.calledNumber,
              source: 'phone',
            },
          },
        })
      } catch (insertErr) {
        console.error('Voicemail raw-first insert failed:', insertErr)
        return res.status(500).json({ error: 'Failed to save lead' })
      }

      console.log('Voicemail lead created:', result.leadId)
      return res.status(200).json({
        success: true,
        lead_id: result.leadId,
        type: 'voicemail',
        hookbackSent: result.hookbackSent,
        transcription_failed: transcriptionFailed,
        ...(result.partial ? { partial: true } : {}),
      })
    } catch (err) {
      console.error('Voicemail processing error:', err)
      return res.status(500).json({ error: 'Voicemail processing failed' })
    }
  }

  // ── Normal email-lead branch — org from CloudMailin plus-tag ───
  if (!emailText.trim()) {
    console.error('Empty email body received from CloudMailin')
    return res.status(200).json({ received: true })
  }

  const orgResolution = await resolveOrgIdFromInboundEmail(supabase, req.body)
  if (orgResolution.source === 'unresolved') {
    console.error(`Inbound email: org not resolved (${orgResolution.reason})`)
    await captureUnroutedInbound(supabase, {
      channel: 'email',
      identifier: orgResolution.tag,
      reason: orgResolution.reason,
      payload: req.body,
    })
    return res.status(200).json({ skipped: true, reason: orgResolution.reason, tag: orgResolution.tag })
  }
  if (!orgResolution.orgId) {
    return res.status(200).json({ skipped: true, reason: 'no_org', tag: orgResolution.tag })
  }
  const orgId = orgResolution.orgId

  const emailEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_email')
  if (!emailEnabled) {
    console.log(`Inbound email disabled for org ${orgId}`)
    return res.status(200).json({ skipped: true, reason: 'inbound_email_disabled' })
  }

  try {
    const { name: senderName, email: senderEmail } = parseEmailSender(from)
    let extractedForAck: ExtractedLeadFields = {}

    let result
    try {
      result = await processInboundLead({
        supabase,
        orgId,
        insertLead: () =>
          insertRawFirstLead(supabase, orgId, {
            org_id: orgId,
            name: senderName,
            phone: null,
            email: senderEmail || from,
            service_type: 'General Enquiry',
            details: subject || 'Inbound email enquiry',
            address: null,
            source: 'email',
            raw_email: emailText,
          }),
        createdEvent: {
          note: 'Lead captured from inbound email (raw-first)',
          payload: {
            source: 'email',
            from,
            subject,
            inbound_tag: orgResolution.tag,
            routing: orgResolution.source,
          },
        },
        extract: async () => {
          let extracted: ExtractedLeadFields
          try {
            extracted = await extractLeadWithClaude(emailText, subject, from, 'email')
          } catch (claudeErr) {
            console.error('Claude email extraction failed:', claudeErr)
            extracted = emailFallbackParse(emailText, subject, from)
          }
          extractedForAck = extracted
          return {
            updateFields: {
              name: extracted.name || senderName,
              phone: extracted.phone,
              email: extracted.email || senderEmail || undefined,
              service_type: extracted.service_type || 'General Enquiry',
              details: extracted.details || subject || 'Inbound email enquiry',
              address: extracted.address,
            },
          }
        },
        selectColumns: 'name, service_type, status, phone',
        buildNotify: ({ savedLead }) => ({
          name: savedLead?.name || senderName,
          service_type: savedLead?.service_type || 'General Enquiry',
          status: savedLead?.status || 'unassigned',
        }),
        followUp: {
          type: 'ack',
          source: 'email',
          resolvePhone: ({ savedLead }) =>
            extractedForAck.phone?.trim() || savedLead?.phone?.trim() || null,
          resolveCustomerName: ({ savedLead }) => savedLead?.name || senderName,
        },
        logLabel: 'inbound email',
        run: {
          workflowKey: 'inbound_lead',
          triggerChannel: 'email',
          triggerSummary: { identifier: orgResolution.tag, source: 'email' },
        },
      })
    } catch (insertErr) {
      console.error('Email raw-first insert failed:', insertErr)
      return res.status(500).json({ error: 'Failed to save lead' })
    }

    console.log('Lead successfully created via CloudMailin:', result.savedLead?.name || from)

    return res.status(200).json({
      success: true,
      lead_id: result.leadId,
      ...(result.partial ? { partial: true } : {}),
    })
  } catch (err) {
    console.error('Inbound email processing error:', err)
    return res.status(500).json({ error: 'Processing failed' })
  }
}
