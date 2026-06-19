// api/inbound-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─────────────────────────────────────────────────────────────────
// VOICEMAIL CONFIG — placeholder until we see a real 3CX email.
// Once you forward me a sample 3CX missed-call email, I'll replace
// extractCallerPhone() with an exact match for wherever 3CX actually
// puts the caller's number (subject line vs body vs a header).
// ─────────────────────────────────────────────────────────────────
const VOICEMAIL_AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3']
const VOICEMAIL_AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.ogg']

function extractCallerPhone(subject: string, body: string): string {
  const text = `${subject} ${body}`
  const match = text.match(/(\+?\d[\d\s()-]{7,}\d)/)
  return match ? match[0].trim() : 'Unknown'
}

interface CloudmailinAttachment {
  file_name?: string
  content_type?: string
  content?: string // base64 — present unless Attachment Store/S3 offload is enabled
  url?: string      // present instead of `content` if offload IS enabled
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

// ── Claude lead extraction — shared by email + voicemail ──────────
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

// ── Notify managers (org-scoped) ───────────────────────────────────
async function notifyManagers(orgId: string, message: string) {
  const { data: managers } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('role', 'manager')

  if (!managers?.length) return

  const notifications = managers.map((m) => ({
    user_id: m.id,
    title: 'New Lead',
    message,
    type: 'new_lead',
    read: false,
    created_at: new Date().toISOString(),
  }))

  await supabase.from('notifications').insert(notifications)
}

// ── Main CloudMailin Handler ──────────────────────────────────────
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

      const callerPhone = extractCallerPhone(subject, emailText)

      let lead: Record<string, any> = {}
      if (!transcriptionFailed && transcript.trim()) {
        try {
          lead = await extractLeadWithClaude(transcript, subject, from, 'voicemail')
        } catch (claudeErr) {
          console.error('Claude voicemail extraction failed:', claudeErr)
        }
      }

      const fallbackDetails = transcriptionFailed
        ? `Voicemail received — transcription failed, please check 3CX manually. Subject: ${subject}`
        : transcript.trim()
          ? `Voicemail transcript: ${transcript}`
          : `Missed call voicemail received. Subject: ${subject}`

      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          org_id: orgId,
          name: lead.name || 'Missed Call',
          phone: lead.phone || callerPhone,
          email: lead.email || null,
          service_type: lead.service_type || 'General Enquiry',
          details: lead.details ? `${lead.details}\n\nFull transcript: ${transcript}` : fallbackDetails,
          address: lead.address || null,
          status: 'unassigned',
          source: 'phone',
          raw_email: transcript || emailText,
        })
        .select()
        .single()

      if (error) throw error

      await notifyManagers(
        orgId,
        transcriptionFailed
          ? 'Missed call voicemail received — transcription failed, please check manually.'
          : `Missed call voicemail from ${lead.phone || callerPhone} — check unassigned leads.`
      )

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

  try {
    const lead = await extractLeadWithClaude(emailText, subject, from, 'email')

    const { error } = await supabase.from('leads').insert({
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

    if (error) throw error

    console.log('Lead successfully created via CloudMailin:', lead.name || from)
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Inbound email processing error:', err)
    return res.status(500).json({ error: 'Processing failed' })
  }
}