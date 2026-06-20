// api/inbound-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function extractLeadWithClaude(emailText: string, subject: string, from: string) {
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
      messages: [
        {
          role: 'user',
          content: `Extract lead information from this email and return ONLY a JSON object with no markdown, no code fences, just raw JSON.

Fields to extract:
- name: full name of the person (or null)
- phone: phone number (or null)
- email: email address
- service_type: type of service requested (e.g. "TV Aerial", "Satellite", "MATV", "General Enquiry")
- details: brief summary of their request (1-2 sentences)
- address: street address if mentioned (or null)

Email From: ${from}
Subject: ${subject}
Body: ${emailText}`,
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`)

  const result = await res.json() as { content: Array<{ type: string; text: string }> }
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

  const { plain, html, headers } = req.body

  const emailText = plain || html?.replace(/<[^>]+>/g, ' ') || ''
  const subject = req.body.subject || headers?.subject || 'No Subject'
  const from = req.body.from || headers?.from || 'Unknown Sender'

  if (!emailText.trim()) {
    console.error('Empty email body received from CloudMailin')
    return res.status(200).json({ received: true })
  }

  try {
    const lead = await extractLeadWithClaude(emailText, subject, from)

    const orgId = process.env.DEFAULT_ORG_ID
    if (!orgId) throw new Error('DEFAULT_ORG_ID not set')

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
