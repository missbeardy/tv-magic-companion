// api/inbound-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// Inlined rate limit (no shared imports — ESM/Vercel constraint)
const requests = new Map<string, { count: number; reset: number }>()
function checkRateLimit(ip: string, limit = 60, windowMs = 60000): boolean {
  const now = Date.now()
  const key = ip.split(',')[0].trim() || 'unknown'
  const entry = requests.get(key)
  if (!entry || now > entry.reset) {
    requests.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function parseEmailWithClaude(rawEmail: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const prompt = `Extract customer details from this email. Return ONLY valid JSON.
Email:
${rawEmail.substring(0, 3000)}

Fields:
- customer_name (string)
- phone (string or empty)
- email (string or empty)
- service_type (one of: "TV Aerial","Satellite Dish","CCTV","Home Automation","Other")
- job_details (string, summary)
- address (string or empty)

Return: {"customer_name":"...","phone":"...","email":"...","service_type":"...","job_details":"...","address":"..."}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) return null
    const data = await response.json() as { content?: Array<{ text?: string }> }
    const raw = data.content?.[0]?.text || ''
    const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()
    return JSON.parse(cleaned)
  } catch (err) {
    console.error('Claude email parse error:', err)
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown'
  if (!checkRateLimit(ip, 60, 60000)) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  try {
    // Resend inbound webhook payload shape
    const body = req.body as {
      from?: string
      to?: string[]
      subject?: string
      text?: string
      html?: string
      headers?: Record<string, string>
    }

    // Prefer plain text, fall back to HTML
    const rawText = body.text || body.html || ''
    if (!rawText.trim()) {
      return res.status(200).json({ skipped: true, reason: 'empty body' })
    }

    const subject = body.subject || ''
    const fromEmail = body.from || ''
    // Resend sends `to` as an array
    const toEmail = Array.isArray(body.to) ? body.to[0] : (body.to || '')

    console.log(`Inbound email from ${fromEmail} to ${toEmail} — subject: ${subject}`)

    // Parse with Claude
    const emailContent = `Subject: ${subject}\nFrom: ${fromEmail}\n\n${rawText}`
    let parsed = await parseEmailWithClaude(emailContent)
    if (!parsed) {
      console.log('Claude failed, using fallback')
      parsed = {
        customer_name: 'Email Enquiry',
        phone: '',
        email: fromEmail,
        service_type: 'Other',
        job_details: rawText.substring(0, 500),
        address: '',
      }
    }

    // Resolve org_id from recipient email address
    let orgId: string | null = null
    if (toEmail) {
      const { data: mapping } = await supabase
        .from('org_emails')
        .select('org_id')
        .eq('email_address', toEmail)
        .maybeSingle()
      if (mapping) orgId = mapping.org_id
    }

    if (!orgId && process.env.DEFAULT_ORG_ID) {
      orgId = process.env.DEFAULT_ORG_ID
      console.log(`Using DEFAULT_ORG_ID: ${orgId}`)
    }

    if (!orgId) {
      console.error('No org_id resolved — lead rejected')
      return res.status(200).json({ skipped: true, reason: 'no org' })
    }

    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        name: `Email Lead: ${parsed.customer_name}`,
        phone: parsed.phone || '',
        email: parsed.email || fromEmail || null,
        service_type: parsed.service_type || 'Other',
        details: parsed.job_details || rawText.substring(0, 500),
        address: parsed.address || '',
        status: 'unassigned',
        source: 'email',
        lead_source: 'Email',
        org_id: orgId,
        raw_email: rawText.substring(0, 5000),
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('Insert error:', error)
    } else {
      console.log(`Lead saved: ${newLead.id} with org ${orgId}`)
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Unhandled error:', err)
    return res.status(200).json({ skipped: true, reason: 'exception' })
  }
}