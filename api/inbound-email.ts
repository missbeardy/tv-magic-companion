// api/inbound-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from './_rateLimit'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function parseEmailWithClaude(rawEmail: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const prompt = `Extract from this email. Return ONLY JSON: {"customer_name":"","phone":"","service_type":"","job_details":"","address":""}
Email: ${rawEmail.substring(0, 3000)}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await response.json()
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
  if (!checkRateLimit(ip, 60, 60000)) return res.status(429).json({ error: 'Too many requests' })

  try {
    const body = req.body as Record<string, string>
    const rawText = body.plain || body.html || body.body || ''
    if (!rawText) return res.status(200).json({ skipped: true })

    let parsed = await parseEmailWithClaude(rawText)
    if (!parsed) {
      parsed = { customer_name: 'Email Enquiry', phone: '', service_type: 'Other', job_details: rawText.substring(0, 500), address: '' }
    }

    // Extract recipient email address (To) from webhook – depends on your email provider
    const toEmail = body.to || body.recipient || ''
    let orgId = null
    if (toEmail) {
      const { data: mapping } = await supabase
        .from('org_emails')
        .select('org_id')
        .eq('email_address', toEmail)
        .maybeSingle()
      orgId = mapping?.org_id || process.env.DEFAULT_ORG_ID || null
    } else {
      orgId = process.env.DEFAULT_ORG_ID || null
    }

    await supabase.from('leads').insert({
      name: parsed.customer_name,
      phone: parsed.phone || '',
      service_type: parsed.service_type || 'Other',
      details: parsed.job_details || rawText,
      address: parsed.address || '',
      status: 'unassigned',
      source: 'email_webhook',
      org_id: orgId,
      raw_email: rawText,
      created_at: new Date().toISOString(),
    })

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error(err)
    return res.status(200).json({ skipped: true, reason: 'exception' })
  }
}