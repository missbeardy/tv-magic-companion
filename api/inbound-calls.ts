import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { isFeatureEnabledForOrg } from './_lib/featureSwitches.js'
import { resolveOrgIdFromDid } from './_lib/resolveOrgFromDid.js'
import { captureUnroutedInbound } from './_lib/captureUnroutedInbound.js'
import { findRecentLeadByPhone } from './_lib/inboundLeadDedup.js'
import { processInboundLead } from './_lib/processInboundLead.js'
import { insertRawFirstLead } from './_lib/rawFirstLead.js'
import { safeCompareSecret } from './_lib/timingSafeCompare.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ThreeCXPayload {
  callerId?: string
  callerNumber?: string
  calledNumber?: string
  callType?: string
  duration?: number
  timestamp?: string
}

function normalizeCallerPhone(phoneNumber: string): string {
  const rawPhone = phoneNumber.replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  if (rawPhone.startsWith('+')) return rawPhone
  if (rawPhone.startsWith('0')) return '+61' + rawPhone.slice(1)
  if (rawPhone.startsWith('61')) return '+' + rawPhone
  return '+61' + rawPhone
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const expectedSecret = process.env.THREECX_WEBHOOK_SECRET
  const incomingSecret = req.headers['x-webhook-secret']

  if (!safeCompareSecret(incomingSecret as string | undefined, expectedSecret)) {
    console.warn('Inbound call rejected: invalid or missing webhook secret')
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    const payload = req.body as ThreeCXPayload

    // Voicemail is handled by inbound-email (CloudMailin voicemail sub-path).
    if (payload.callType !== 'missed') {
      return res.status(200).json({
        skipped: true,
        reason: payload.callType === 'voicemail' ? 'voicemail_deferred_to_email' : 'not_missed_call',
      })
    }

    const phoneNumber = payload.callerNumber || payload.callerId || ''
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Missing caller number' })
    }

    const normalizedPhone = normalizeCallerPhone(phoneNumber)
    const { orgId, source } = await resolveOrgIdFromDid(supabase, payload.calledNumber)

    if (!orgId) {
      console.error('Inbound missed call: no org_id resolved')
      await captureUnroutedInbound(supabase, {
        channel: 'call',
        identifier: payload.calledNumber,
        reason: 'no_mapping',
        payload,
      })
      return res.status(200).json({ skipped: true, reason: 'no_org' })
    }

    const callsEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_calls')
    if (!callsEnabled) {
      console.log(`Inbound calls disabled for org ${orgId}`)
      return res.status(200).json({ skipped: true, reason: 'inbound_calls_disabled' })
    }

    const existingLead = await findRecentLeadByPhone(supabase, normalizedPhone, orgId)

    if (existingLead) {
      await supabase.from('lead_events').insert({
        lead_id: existingLead.id,
        event_type: 'missed_call_again',
        note: `Another missed call from ${normalizedPhone} at ${payload.timestamp}`,
        org_id: orgId,
        payload: {
          phone: normalizedPhone,
          call_type: payload.callType,
          source: '3cx_missed_call',
        },
      })

      return res.status(200).json({
        success: true,
        action: 'logged_to_existing',
        leadId: existingLead.id,
      })
    }

    let result
    try {
      result = await processInboundLead({
        supabase,
        orgId,
        insertLead: async () =>
          insertRawFirstLead(supabase, orgId, {
            org_id: orgId,
            name: 'Missed Call',
            phone: normalizedPhone,
            service_type: 'Other',
            details: `Missed call from ${normalizedPhone}. Call type: ${payload.callType}. Duration: ${payload.duration || 0}s`,
            source: '3cx_missed_call',
            raw_sms: JSON.stringify(payload),
            created_at: payload.timestamp || new Date().toISOString(),
          }),
        createdEvent: {
          note: 'Lead created from missed call',
          payload: {
            phone: normalizedPhone,
            call_type: payload.callType,
            source: '3cx_missed_call',
          },
        },
        buildNotify: (ctx) => ({
          name: ctx.savedLead?.name ?? 'Missed Call',
          service_type: ctx.savedLead?.service_type ?? 'Other',
          status: ctx.savedLead?.status ?? 'unassigned',
        }),
        followUp: {
          type: 'hookback',
          source: '3cx_missed_call',
          resolvePhone: () => normalizedPhone,
          resolveCustomerName: () => 'there',
        },
        logLabel: 'missed call',
        run: {
          workflowKey: 'inbound_lead',
          triggerChannel: 'call',
          triggerSummary: { identifier: payload.calledNumber, source: '3cx_missed_call' },
        },
      })
    } catch (insertErr) {
      return res.status(500).json({ error: 'Failed to create lead' })
    }

    return res.status(200).json({
      success: true,
      action: 'created_new_lead',
      leadId: result.leadId,
      hookbackSent: result.hookbackSent,
    })
  } catch (err) {
    console.error('Inbound call handler error:', err)
    return res.status(200).json({ skipped: true, reason: 'exception' })
  }
}
