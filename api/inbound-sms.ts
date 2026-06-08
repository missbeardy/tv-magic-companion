import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function parseSmswithClaude(smsText: string, fromNumber: string) {
  const prompt = `You are a CRM data extractor for a TV aerial and satellite installation business.

A customer has sent the following SMS enquiry. Extract what you can. Return ONLY valid JSON — no markdown, no explanation, no backticks.

Fields:
- customer_name (string, use "SMS Enquiry" if no name given)
- phone (string, use the from number provided if not mentioned in message)
- service_type (string, one of: "TV Aerial", "Satellite Dish", "CCTV", "Sky Q", "Sky Glass", "Freesat", "Other")
- job_details (string, summary of what they need — use the raw message if nothing clear)
- address (string, empty string if not mentioned)

From number: ${fromNumber}
SMS message: ${smsText}

Return JSON only.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = (await response.json()) as any;
const raw = data.content
  ?.map((b: { type: string; text?: string }) => b.type === 'text' ? b.text : '')
  .join('') ?? ''
const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    console.error('Claude returned unparseable JSON:', cleaned)
    return null
  }
}

async function notifyManagers(leadName: string, serviceType: string, fromNumber: string) {
  // Find all manager profiles to notify
  const { data: managers } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'manager')

  if (!managers?.length) return

  // Insert a notification for each manager
  const notifications = managers.map((m) => ({
    user_id: m.id,
    title: 'New SMS Lead',
    message: `${leadName} enquired about ${serviceType} (from ${fromNumber})`,
    type: 'new_lead',
    read: false,
    created_at: new Date().toISOString(),
  }))

  await supabase.from('notifications').insert(notifications)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Twilio sends form-encoded data
    const body = req.body as Record<string, string>
    const smsText = body.Body || ''
    const fromNumber = body.From || 'Unknown'

    if (!smsText.trim()) {
      // Still return 200 — Twilio will retry on non-200
      return res.status(200).send('<Response></Response>')
    }

    const parsed = await parseSmswithClaude(smsText, fromNumber)

    if (!parsed) {
      return res.status(200).send('<Response></Response>')
    }

    // Insert as unassigned lead
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        name: parsed.customer_name || 'SMS Enquiry',
        phone: parsed.phone || fromNumber,
        service_type: parsed.service_type || 'Other',
        details: parsed.job_details || smsText,
        address: parsed.address || '',
        status: 'unassigned',
        source: 'sms',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return res.status(200).send('<Response></Response>')
    }

    // Notify managers
    await notifyManagers(
      parsed.customer_name || 'SMS Enquiry',
      parsed.service_type || 'Other',
      fromNumber
    )

    console.log('SMS lead created:', newLead?.id)

    // Twilio expects TwiML response — empty response means no reply SMS is sent
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')

  } catch (err) {
    console.error('Inbound SMS handler error:', err)
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }
}