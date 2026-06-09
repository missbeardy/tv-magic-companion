import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ThreeCXPayload {
  callerId?: string
  callerNumber?: string
  calledNumber?: string
  callType?: string  // 'missed', 'answered', 'voicemail'
  duration?: number
  timestamp?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // SEC-03: Shared secret authentication
  // 3CX must send this header with every webhook call
  const expectedSecret = process.env.THREECX_WEBHOOK_SECRET
  const incomingSecret = req.headers['x-webhook-secret']

  if (!expectedSecret || incomingSecret !== expectedSecret) {
    console.warn('Inbound call rejected: invalid or missing webhook secret')
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    const payload = req.body as ThreeCXPayload

    // Only process missed calls and voicemails
    if (payload.callType !== 'missed' && payload.callType !== 'voicemail') {
      return res.status(200).json({ skipped: true, reason: 'not_missed_call' })
    }

    const phoneNumber = payload.callerNumber || payload.callerId || ''
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Missing caller number' })
    }

    // Normalize to E.164
    const rawPhone = phoneNumber.replace(/\s+/g, '').replace(/[^0-9+]/g, '')
    const normalizedPhone = rawPhone.startsWith('+') ? rawPhone
      : rawPhone.startsWith('0') ? '+61' + rawPhone.slice(1)
      : rawPhone.startsWith('61') ? '+' + rawPhone
      : '+61' + rawPhone

    // Determine org from called number (DID mapping)
    const calledNumber = payload.calledNumber || ''
    const { data: didMapping } = await supabase
      .from('org_phone_numbers')
      .select('org_id')
      .eq('phone_number', calledNumber.replace(/\s+/g, ''))
      .maybeSingle()

    const orgId = didMapping?.org_id || null

    // Check for duplicate (same number in last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', normalizedPhone)
      .gte('created_at', twentyFourHoursAgo)
      .maybeSingle()

    if (existingLead) {
      // Log the call attempt but don't create duplicate
      await supabase.from('lead_events').insert({
        lead_id: existingLead.id,
        event_type: 'missed_call_again',
        note: `Another missed call from ${normalizedPhone} at ${payload.timestamp}`,
        org_id: orgId,
      })

      return res.status(200).json({ 
        success: true, 
        action: 'logged_to_existing',
        leadId: existingLead.id 
      })
    }

    // Create new lead from missed call
    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        name: 'Missed Call',
        phone: normalizedPhone,
        service_type: 'Other',
        details: `Missed call from ${normalizedPhone}. Call type: ${payload.callType}. Duration: ${payload.duration || 0}s`,
        status: 'unassigned',
        source: '3cx_missed_call',
        raw_sms: JSON.stringify(payload),
        org_id: orgId,
        created_at: payload.timestamp || new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Failed to create lead from missed call:', insertError)
      return res.status(500).json({ error: 'Failed to create lead' })
    }

    // Notify managers of new missed call lead
    const { data: managers } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'manager')
      .eq('org_id', orgId)

    if (managers?.length) {
      const notifications = managers.map((m) => ({
        user_id: m.id,
        title: 'Missed Call Lead',
        message: `New lead from missed call: ${normalizedPhone}`,
        type: 'new_lead',
        read: false,
        lead_id: newLead.id,
        org_id: orgId,
        created_at: new Date().toISOString(),
      }))

      await supabase.from('notifications').insert(notifications)
    }

    return res.status(200).json({ 
      success: true, 
      action: 'created_new_lead',
      leadId: newLead.id 
    })

  } catch (err) {
    console.error('Inbound call handler error:', err)
    return res.status(200).json({ skipped: true, reason: 'exception' })
  }
}