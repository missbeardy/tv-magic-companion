// api/inbound-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { Webhook } from 'svix'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ── Inline rate limiter ────────────────────────────────────────────────────
const requestCounts = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(ip: string, limit = 10, windowMs = 60000): boolean {
  const now = Date.now()
  const record = requestCounts.get(ip)
  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + windowMs })
    return true
  }
  if (record.count >= limit) return false
  record.count++
  return true
}

// ── Verify Resend webhook signature ───────────────────────────────────────
function verifyResendWebhook(req: VercelRequest, body: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return false
  try {
    const wh = new Webhook(secret)
    wh.verify(body, {
      'svix-id': req.headers['svix-id'] as string,
      'svix-timestamp': req.headers['svix-timestamp'] as string,
      'svix-signature': req.headers['svix-signature'] as string,
    })
    return true
  } catch {
    return false
  }
}

// ── Fetch email body from Resend API ──────────────────────────────────────
async function fetchEmailContent(emailId: string): Promise<{ plain: string; html: string }> {
  const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`Resend API error: ${res.status}`)
  const data = await res.json()
  return {
    plain: data.text || '',
    html: data.html || '',
  }
}

// ── Claude lead extraction ────────────────────────────────────────────────
async function extractLeadWithClaude(emailText: string, subject: string, from: string) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
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
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const clean = raw.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 'unknown'
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded' })
  }

  // Get raw body for signature verification
  const rawBody = JSON.stringify(req.body)

  if (!verifyResendWebhook(req, rawBody)) {
    console.error('Invalid Resend webhook signature')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const event = req.body

  // Only handle inbound email events
  if (event.type !== 'email.received') {
    return res.status(200).json({ received: true })
  }

  const { email_id, from, to, subject } = event.data

  try {
    // Fetch the actual email body from Resend
    const { plain, html } = await fetchEmailContent(email_id)
    const emailText = plain || html.replace(/<[^>]+>/g, ' ')

    if (!emailText.trim()) {
      console.error('Empty email body for id:', email_id)
      return res.status(200).json({ received: true })
    }

    // Extract lead data with Claude
    const lead = await extractLeadWithClaude(emailText, subject || '', from)

    // Get org_id
    const orgId = process.env.DEFAULT_ORG_ID
    if (!orgId) throw new Error('DEFAULT_ORG_ID not set')

    // Insert lead into Supabase
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
    })

    if (error) throw error

    console.log('Lead created from Resend inbound email:', lead.name || from)
    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('Inbound email processing error:', err)
    return res.status(500).json({ error: 'Processing failed' })
  }
}