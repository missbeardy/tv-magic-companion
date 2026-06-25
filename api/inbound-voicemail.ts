// api/inbound-voicemail.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { isFeatureEnabledForOrg } from './_lib/featureSwitches.js'
import { resolveOrgIdFromDid } from './_lib/resolveOrgFromDid.js'
import { findRecentLeadByPhone } from './_lib/inboundLeadDedup.js'
import { formatAuPhoneForSms } from './_lib/phone.js'
import { notifyManagersNewLead } from './_lib/notifyManagersNewLead.js'
import { sendMissedCallHookbackIfEnabled } from './_lib/missedCallHookbackSms.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Verify this POST genuinely came from Mailgun ───────────────────
function verifyMailgunSignature(timestamp: string, token: string, signature: string): boolean {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY!
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex')
  return expected === signature
}

// ── Voicemail metadata — matches your 3CX email format ─────────────
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

// ── Find + fetch the audio attachment from Mailgun's stored message ─
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

// ── Whisper transcription ────────────────────────────────────────
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

// ── Claude lead extraction ───────────────────────────────────────
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

// ── Main Mailgun store()+notify() Handler ──────────────────────────
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

  const orgId = await resolveOrgIdFromDid(supabase, metadataPreview.calledNumber)
  if (!orgId) {
    console.error('Voicemail: no org_id resolved')
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

    const audioAttachment = attachments.find(isAudioAttachment)

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

    const metadata = extractVoicemailMetadata(subject, bodyPlain)
    const callInfo = `Call received: ${metadata.receivedAt || 'time unknown'} (${metadata.duration || '?'}s)${
      metadata.extensionName ? ` via ${metadata.extensionName}` : ''
    }`

    let lead: Record<string, any> = {}
    if (!transcriptionFailed && transcript.trim()) {
      try {
        lead = await extractLeadWithClaude(transcript)
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
        raw_email: transcript || bodyPlain,
      })
      .select()
      .single()

    if (error) throw error

    await supabase.from('lead_events').insert({
      lead_id: newLead.id,
      org_id: orgId,
      event_type: 'created',
      note: 'Lead created from inbound voicemail',
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

    let hookbackSent = false
    if (normalizedPhone) {
      hookbackSent = await sendMissedCallHookbackIfEnabled({
        orgId,
        leadId: newLead.id,
        toPhone: normalizedPhone,
        customerName: newLead.name,
        source: 'phone',
      })
    }

    console.log('Voicemail lead created:', newLead?.id)
    return res.status(200).json({ success: true, lead_id: newLead?.id, hookbackSent })
  } catch (err) {
    console.error('Voicemail processing error:', err)
    return res.status(500).json({ error: 'Voicemail processing failed' })
  }
}
