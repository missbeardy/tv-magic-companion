// api/inbound-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import './_lib/loadLocalEnv.js'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { processInboundLead } from './_lib/processInboundLead.js'
import { insertRawFirstLead } from './_lib/rawFirstLead.js'
import { resolveOrgIdFromDid } from './_lib/resolveOrgFromDid.js'
import { captureUnroutedInbound } from './_lib/captureUnroutedInbound.js'
import { computeTwilioSignature } from './_lib/twilioSignature.js'
import { readRawBody } from './_lib/rawBody.js'
import { extractFromSms } from './_lib/extractLead.js'

/**
 * Disable Vercel's default body parser so the Meta webhook can verify its
 * HMAC over the exact raw bytes. The Twilio path re-parses the raw
 * form-encoded body explicitly in the handler below.
 */
export const config = {
  api: {
    bodyParser: false,
  },
}

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

function webhookUrlFromRequest(req: VercelRequest): string {
  const host = req.headers.host
  if (!host || typeof host !== 'string') return ''
  const proto =
    host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  const path = (req.url ?? '/api/inbound-sms').split('?')[0]
  return `${proto}://${host}${path}`
}

function verifyTwilioSignature(req: VercelRequest, authToken: string): boolean {
  const twilioSig = req.headers['x-twilio-signature'] as string
  if (!twilioSig) return false
  const url = webhookUrlFromRequest(req)
  const params = req.body as Record<string, string>
  const expectedSig = computeTwilioSignature(url, params, authToken)
  try {
    return timingSafeEqual(Buffer.from(twilioSig), Buffer.from(expectedSig))
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : undefined

  // Body parser is disabled (see `config` above); read the raw stream once.
  const rawBody = (await readRawBody(req)).toString('utf8')

  if (action === 'meta-webhook') {
    const { handleMetaWebhook } = await import('./_lib/metaWebhook.js')
    return handleMetaWebhook(req, res, supabase, rawBody)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Twilio posts application/x-www-form-urlencoded. Reconstruct the params
  // object the rest of this handler (and verifyTwilioSignature) expects.
  req.body = Object.fromEntries(new URLSearchParams(rawBody))

  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown'
  if (!checkRateLimit(ip)) {
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('Missing TWILIO_AUTH_TOKEN')
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }

  if (!verifyTwilioSignature(req, authToken)) {
    console.warn('Invalid signature')
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }

  try {
    const body = req.body as Record<string, string>
    const smsText = body.Body || ''
    const fromNumber = body.From || ''
    const toNumber = body.To || ''

    if (!smsText.trim()) {
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    console.log(`SMS from ${fromNumber} to ${toNumber}`)

    const { orgId, source } = await resolveOrgIdFromDid(supabase, toNumber)

    if (!orgId) {
      console.error('No org_id – lead rejected')
      await captureUnroutedInbound(supabase, {
        channel: 'sms',
        identifier: toNumber,
        reason: 'no_mapping',
        payload: body,
      })
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    const { isFeatureEnabledForOrg } = await import('./_lib/featureSwitches.js')
    const inboundEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_sms')
    if (!inboundEnabled) {
      console.log(`Inbound SMS disabled for org ${orgId}`)
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    let parsedForAck: { customer_name?: string; phone?: string; service_type?: string } = {}

    let leadId: string
    try {
      const result = await processInboundLead({
        supabase,
        orgId,
        insertLead: () =>
          insertRawFirstLead(supabase, orgId, {
            org_id: orgId,
            name: 'SMS Enquiry',
            phone: fromNumber,
            email: null,
            service_type: 'Other',
            details: smsText.substring(0, 500),
            address: null,
            source: 'sms',
            lead_source: 'SMS',
            raw_sms: JSON.stringify(body),
            created_at: new Date().toISOString(),
          }),
        createdEvent: {
          note: 'Lead captured from inbound SMS (raw-first)',
          payload: { source: 'sms', from: fromNumber },
        },
        extract: async () => {
          const { fields: parsed, status } = await extractFromSms(smsText, fromNumber)
          parsedForAck = {
            customer_name: parsed.name ?? undefined,
            phone: parsed.phone ?? undefined,
            service_type: parsed.service_type ?? undefined,
          }
          return {
            updateFields: {
              name: `SMS Lead: ${parsed.name || 'SMS Enquiry'}`,
              phone: parsed.phone?.trim() || fromNumber,
              email: parsed.email?.trim() || undefined,
              service_type: parsed.service_type || 'Other',
              details: parsed.details || smsText.substring(0, 500),
              address: parsed.address?.trim() || undefined,
            },
            extractionStatus: status,
          }
        },
        buildNotify: ({ savedLead, extraction }) => ({
          name: savedLead?.name || extraction?.updateFields.name || 'SMS Enquiry',
          service_type: savedLead?.service_type || parsedForAck.service_type || 'Other',
          status: savedLead?.status || 'unassigned',
        }),
        followUp: {
          type: 'ack',
          source: 'sms',
          resolvePhone: () => parsedForAck.phone?.trim() || fromNumber,
          resolveCustomerName: () => parsedForAck.customer_name || 'there',
        },
        logLabel: 'inbound SMS',
        run: {
          workflowKey: 'inbound_lead',
          triggerChannel: 'sms',
          triggerSummary: { identifier: toNumber, source: 'sms' },
        },
      })
      leadId = result.leadId
    } catch (insertErr) {
      console.error('SMS raw-first insert failed:', insertErr)
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    console.log(`Lead saved: ${leadId} with org ${orgId}`)

    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  } catch (err) {
    console.error('Unhandled error:', err)
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }
}
