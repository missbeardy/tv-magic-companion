// api/inbound-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { isFeatureEnabledForOrg } from './_lib/featureSwitches.js'
import { resolveOrgIdFromDid } from './_lib/resolveOrgFromDid.js'
import { findRecentLeadByPhone } from './_lib/inboundLeadDedup.js'
import { formatAuPhoneForSms } from './_lib/phone.js'
import { notifyManagersNewLead } from './_lib/notifyManagersNewLead.js'

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
  form.append('file', new Blob([buffer]), fileName || 'voicemail.wav')
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

  const orgId = process.env.DEFAULT_ORG_ID
  if (!orgId) {
    console.error('DEFAULT_ORG_ID not set')
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  // ── Voicemail branch ──────────────────────────────────────────
  const voicemailAttachment = attachments?.find(isVoicemailAttachment)

  if (voicemailAttachment) {
    const metadataPreview = extractVoicemailMetadata(subject, emailText)
    const orgId = await resolveOrgIdFromDid(supabase, metadataPreview.calledNumber)
    if (!orgId) {
      console.error('Voicemail email: no org_id resolved')
      return res.status(200).json({ skipped: true, reason: 'no_org' })
    }

    const callsEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_calls')
    if (!callsEnabled) {
      console.log(`Inbound calls/voicemail disabled for org ${orgId}`)
      return res.status(200).json({ skipped: true, reason: 'inbound_calls_disabled' })
    }
    try {
      let transcript = ''
      let transcriptionFailed = false

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

      const metadata = extractVoicemailMetadata(subject, emailText)
      const callInfo = `Call received: ${metadata.receivedAt || 'time unknown'} (${metadata.duration || '?'}s)${
        metadata.extensionName ? ` via ${metadata.extensionName}` : ''
      }`

      let lead: Record<string, any> = {}
      if (!transcriptionFailed && transcript.trim()) {
        try {
          lead = await extractLeadWithClaude(transcript, subject, from, 'voicemail')
        } catch (claudeErr) {
          console.error('Claude voicemail extraction failed:', claudeErr)
        }
      }

      const fallbackDetails = transcriptionFailed
        ? `Voicemail received — transcription failed, please check 3CX manually. ${callInfo}`
        : transcript.trim()
          ? `Voicemail transcript: ${transcript}\n\n${callInfo}`
          : `Missed call voicemail received. ${callInfo}`

      const rawPhone = lead.phone || metadata.phone
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
            payload: { source: 'phone', transcription_failed: transcriptionFailed },
          })
          return res.status(200).json({
            success: true,
            action: 'logged_to_existing',
            lead_id: existingLead.id,
            type: 'voicemail',
          })
        }
      }

      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          org_id: orgId,
          name: lead.name || 'Missed Call',
          phone: normalizedPhone || rawPhone,
          email: lead.email || null,
          service_type: lead.service_type || 'General Enquiry',
          details: lead.details
            ? `${lead.details}\n\nFull transcript: ${transcript}\n\n${callInfo}`
            : fallbackDetails,
          address: lead.address || null,
          status: 'unassigned',
          source: 'phone',
          raw_email: transcript || emailText,
        })
        .select()
        .single()

      if (error) throw error

      await supabase.from('lead_events').insert({
        lead_id: newLead.id,
        org_id: orgId,
        event_type: 'created',
        note: 'Lead created from inbound voicemail email',
        payload: {
          source: 'phone',
          transcription_failed: transcriptionFailed,
        },
      })

      await notifyManagersNewLead({
        id: newLead.id,
        org_id: orgId,
        name: newLead.name,
        service_type: newLead.service_type,
        status: 'unassigned',
      })

      console.log('Voicemail lead created:', newLead?.id)
      return res.status(200).json({ success: true, lead_id: newLead?.id, type: 'voicemail' })
    } catch (err) {
      console.error('Voicemail processing error:', err)
      return res.status(500).json({ error: 'Voicemail processing failed' })
    }
  }

  // ── Normal email-lead branch (unchanged behaviour) ──────────────
  if (!emailText.trim()) {
    console.error('Empty email body received from CloudMailin')
    return res.status(200).json({ received: true })
  }

  const emailEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_email')
  if (!emailEnabled) {
    console.log(`Inbound email disabled for org ${orgId}`)
    return res.status(200).json({ skipped: true, reason: 'inbound_email_disabled' })
  }

  try {
    const lead = await extractLeadWithClaude(emailText, subject, from, 'email')

    const { data: newLead, error } = await supabase.from('leads').insert({
      org_id: orgId,
      name: lead.name || from,
      phone: lead.phone || null,
      email: lead.email || from,
      service_type: lead.service_type || 'General Enquiry',
      details: lead.details || subject || 'Inbound email enquiry',
      address: lead.address || null,
      status: 'unassigned',
      source: 'email',
      raw_email: emailText,
    })
      .select('id')
      .single()

    if (error) throw error

    await supabase.from('lead_events').insert({
      lead_id: newLead.id,
      org_id: orgId,
      event_type: 'created',
      note: 'Lead created from inbound email',
      payload: {
        source: 'email',
        from,
        subject,
      },
    })

    console.log('Lead successfully created via CloudMailin:', lead.name || from)
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Inbound email processing error:', err)
    return res.status(500).json({ error: 'Processing failed' })
  }
}