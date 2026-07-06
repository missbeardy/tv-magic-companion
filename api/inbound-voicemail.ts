// api/inbound-voicemail.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { isFeatureEnabledForOrg } from './_lib/featureSwitches.js'
import { resolveOrgIdFromDid } from './_lib/resolveOrgFromDid.js'
import { captureUnroutedInbound } from './_lib/captureUnroutedInbound.js'
import { findRecentLeadByPhone } from './_lib/inboundLeadDedup.js'
import { formatAuPhoneForSms } from './_lib/phone.js'
import { processInboundLead } from './_lib/processInboundLead.js'
import {
  insertRawFirstLead,
  type ExtractedLeadFields,
} from './_lib/rawFirstLead.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function verifyMailgunSignature(timestamp: string, token: string, signature: string): boolean {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY!
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex')
  return expected === signature
}

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

interface MailgunAttachment {
  url?: string
  'content-type'?: string
  contentType?: string
  name?: string
  filename?: string
}

const AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3']
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.ogg']

function isAudioAttachment(att: MailgunAttachment): boolean {
  const type = (att['content-type'] || att.contentType || '').toLowerCase()
  const name = (att.name || att.filename || '').toLowerCase()
  return (
    AUDIO_TYPES.some((t) => type.includes(t)) ||
    AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext))
  )
}

async function fetchAttachment(url: string): Promise<Buffer> {
  const auth = Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64')
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
  if (!res.ok) throw new Error(`Mailgun attachment fetch failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
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

async function extractLeadWithClaude(transcript: string) {
  const prompt = `This is an automated transcript of a voicemail left by a customer who called a TV aerial/satellite installation business and missed reaching anyone. The transcript may contain transcription errors — use your best judgement. Return ONLY a JSON object, no markdown, no code fences.

Fields:
- name: full name (or null)
- phone: phone number if mentioned in the transcript (or null)
- email: email address if mentioned (or null)
- service_type: type of service requested (e.g. "TV Aerial", "Satellite", "MATV", "General Enquiry")
- details: brief summary of what they need (1-2 sentences)
- address: street address if mentioned (or null)

Voicemail transcript: ${transcript}`

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

  const body = req.body as Record<string, any>

  const { timestamp, token, signature } = body
  if (!timestamp || !token || !signature || !verifyMailgunSignature(timestamp, token, signature)) {
    console.error('Mailgun signature verification failed')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const subject = body.subject || 'No Subject'
  const bodyPlain = body['body-plain'] || ''
  const metadataPreview = extractVoicemailMetadata(subject, bodyPlain)

  const { orgId, source } = await resolveOrgIdFromDid(supabase, metadataPreview.calledNumber)
  if (!orgId) {
    console.error('Voicemail: no org_id resolved')
    await captureUnroutedInbound(supabase, {
      channel: 'voicemail',
      identifier: metadataPreview.calledNumber,
      reason: 'no_mapping',
      payload: body,
    })
    return res.status(200).json({ skipped: true, reason: 'no_org' })
  }

  const callsEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_calls')
  if (!callsEnabled) {
    console.log(`Inbound calls/voicemail disabled for org ${orgId}`)
    return res.status(200).json({ skipped: true, reason: 'inbound_calls_disabled' })
  }

  try {
    let attachments: MailgunAttachment[] = []
    try {
      attachments = JSON.parse(body.attachments || '[]')
    } catch {
      attachments = []
    }

    const metadata = extractVoicemailMetadata(subject, bodyPlain)
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
        })
      }
    }

    const audioAttachment = attachments.find(isAudioAttachment)

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
            raw_email: bodyPlain,
          }),
        createdEvent: {
          note: 'Lead captured from inbound voicemail (raw-first)',
          payload: { source: 'phone' },
        },
        extract: async () => {
          let transcript = ''
          let transcriptionFailed = false

          if (audioAttachment?.url) {
            try {
              const buffer = await fetchAttachment(audioAttachment.url)
              transcript = await transcribeAudio(
                buffer,
                audioAttachment.name || audioAttachment.filename || 'voicemail.wav'
              )
            } catch (transcribeErr) {
              console.error('Voicemail transcription failed:', transcribeErr)
              transcriptionFailed = true
            }
          } else {
            console.error('No audio attachment found on stored message')
            transcriptionFailed = true
          }

          let extracted: ExtractedLeadFields = {}
          if (!transcriptionFailed && transcript.trim()) {
            try {
              extracted = await extractLeadWithClaude(transcript)
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
          source: 'phone',
          resolvePhone: ({ savedLead }) =>
            savedLead?.phone
              ? formatAuPhoneForSms(String(savedLead.phone))
              : normalizedPhone,
          resolveCustomerName: ({ savedLead }) => savedLead?.name || 'there',
        },
        logLabel: 'inbound voicemail',
      })
    } catch (insertErr) {
      console.error('Voicemail raw-first insert failed:', insertErr)
      return res.status(500).json({ error: 'Failed to save lead' })
    }

    console.log('Voicemail lead created:', result.leadId)
    return res.status(200).json({
      success: true,
      lead_id: result.leadId,
      hookbackSent: result.hookbackSent,
      ...(result.partial ? { partial: true } : {}),
    })
  } catch (err) {
    console.error('Voicemail processing error:', err)
    return res.status(500).json({ error: 'Voicemail processing failed' })
  }
}
