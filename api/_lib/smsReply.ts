import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { AuthContext } from './auth.js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { formatAuPhoneForSms } from './phone.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { sendTwilioSms } from './twilioSend.js'

/** In-app technician reply. Server allows two_way_sms or customer_ontheway_sms. */
export async function handleSmsReply(
  req: VercelRequest,
  res: VercelResponse,
  auth: AuthContext
): Promise<VercelResponse> {
  const twoWay = await isFeatureEnabledForOrg(auth.orgId, 'two_way_sms')
  const onTheWay = await isFeatureEnabledForOrg(auth.orgId, 'customer_ontheway_sms')
  if (!twoWay && !onTheWay) {
    return res.status(403).json({ error: 'In-app SMS is disabled for this franchise' })
  }

  const { leadId, message } = (req.body ?? {}) as { leadId?: unknown; message?: unknown }
  const id = typeof leadId === 'string' ? leadId.trim() : ''
  const body = typeof message === 'string' ? message.trim() : ''
  if (!id) return res.status(400).json({ error: 'Missing leadId' })
  if (!body) return res.status(400).json({ error: 'Missing message' })

  const supabase = getSupabaseAdmin()
  if (!supabase) return res.status(500).json({ error: 'Server not configured' })

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, org_id, phone')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return res.status(500).json({ error: 'Failed to load lead' })
  if (!lead) return res.status(404).json({ error: 'Lead not found' })
  if (lead.org_id !== auth.orgId) {
    return res.status(403).json({ error: 'Lead not in your organisation' })
  }
  if (!lead.phone?.trim()) {
    return res.status(400).json({ error: 'Lead has no phone number' })
  }

  const result = await sendTwilioSms({ orgId: auth.orgId, to: lead.phone, body })
  if (result.skipped === 'opted_out') {
    return res.status(403).json({ error: 'This number has opted out of SMS' })
  }
  if (result.skipped === 'no_sender_number') {
    return res.status(503).json({ error: 'No SMS sender number configured for this organisation' })
  }
  if (!result.sent) {
    return res.status(502).json({ error: result.error ?? result.skipped ?? 'Failed to send SMS' })
  }

  await supabase.from('lead_events').insert({
    lead_id: lead.id,
    org_id: auth.orgId,
    event_type: 'sms_sent',
    note: body,
    payload: {
      channel: 'sms',
      phone: formatAuPhoneForSms(lead.phone),
      manual: true,
      from_app: true,
      twilio_sid: result.sid ?? null,
    },
    created_by: auth.userId,
  })

  return res.status(200).json({ success: true, sid: result.sid })
}
