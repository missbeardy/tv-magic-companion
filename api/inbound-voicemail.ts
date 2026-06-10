import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from './_rateLimit'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl!, supabaseKey!)

async function notifyManagers(phone: string, hasTranscript: boolean) {
  const { data: managers } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'manager')

  if (!managers?.length) return

  const message = hasTranscript
    ? `Missed call from ${phone} — voicemail transcription captured. Check unassigned leads.`
    : `Missed call from ${phone} — no voicemail left. Follow up required.`

  const notifications = managers.map((m) => ({
    user_id: m.id,
    title: 'Missed Call — New Lead',
    message,
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

  // SEC-08: Rate limit — 60 req/min for webhook source IPs (3CX)
  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown'
  if (!checkRateLimit(ip, 60, 60_000)) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  try {
    const body = req.body as Record<string, string>

    const fromPhone = body.caller_phone || body.from || 'Unknown'
    const callStatus = body.call_status || 'Missed Call'
    const transcript = body.lead_notes || ''
    const timestamp = body.timestamp || new Date().toISOString()

    const hasTranscript = transcript.trim().length > 0

    const jobDetails = hasTranscript
      ? `Voicemail transcript: ${transcript}`
      : `Missed call received at ${timestamp}. No voicemail left — customer callback required.`

    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        name: 'Missed Call',
        phone: fromPhone,
        service_type: 'Other',
        details: jobDetails,
        address: '',
        status: 'unassigned',
        source: 'phone',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return res.status(500).json({ error: 'Failed to create lead' })
    }

    await notifyManagers(fromPhone, hasTranscript)

    console.log('3CX missed call lead created:', newLead?.id)

    return res.status(200).json({ success: true, lead_id: newLead?.id })
  } catch (err) {
    console.error('Inbound voicemail handler error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}