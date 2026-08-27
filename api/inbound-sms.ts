// api/inbound-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import './_lib/loadLocalEnv.js'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { processInboundLead } from './_lib/processInboundLead.js'
import { withObservability } from './_lib/observability.js'
import { insertRawFirstLead } from './_lib/rawFirstLead.js'
import { resolveOrgIdFromDid } from './_lib/resolveOrgFromDid.js'
import { captureUnroutedInbound } from './_lib/captureUnroutedInbound.js'
import { computeTwilioSignature } from './_lib/twilioSignature.js'
import { readRawBody } from './_lib/rawBody.js'
import { extractFromSms } from './_lib/extractLead.js'
import { checkRateLimit, rateLimitIdentifier } from './_lib/rateLimit.js'
import { captureServerException } from './_lib/sentry.js'
import { waitUntil } from '@vercel/functions'

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

/** Twilio only needs an empty TwiML ack; send it and move on. */
function respondOk(res: VercelResponse): void {
  res.setHeader('Content-Type', 'text/xml')
  res.status(200).send('<Response></Response>')
}

async function handler(req: VercelRequest, res: VercelResponse) {
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

  const identifier = rateLimitIdentifier(req.headers['x-forwarded-for'] as string | undefined)
  const allowed = await checkRateLimit({ scope: 'inbound-sms', identifier, limit: 60, windowMs: 60_000 })
  if (!allowed) {
    return respondOk(res)
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('Missing TWILIO_AUTH_TOKEN')
    return respondOk(res)
  }

  if (!verifyTwilioSignature(req, authToken)) {
    console.warn('Invalid signature')
    return respondOk(res)
  }

  const body = req.body as Record<string, string>
  const smsText = body.Body || ''
  const fromNumber = body.From || ''
  const toNumber = body.To || ''

  // Twilio gives a webhook ~15s, and this pipeline routinely runs longer (Claude
  // extraction, manager notifications, the ack SMS). That was surfacing as a 502 /
  // error 11200 on every single inbound message even though the lead itself saved
  // fine. Acknowledge Twilio first, then finish the work via waitUntil.
  respondOk(res)

  if (!smsText.trim()) return

  const pipeline = finishInboundSms({ body, smsText, fromNumber, toNumber })

  // The Platform Admin simulator invokes this handler in-process (invokeApiHandler)
  // and must not report a result before the lead exists, so it asks to be awaited.
  // A real Twilio webhook hands the pipeline to waitUntil instead — see below.
  if (req.headers['x-inbound-await'] === '1') {
    await pipeline
    return
  }

  waitUntil(pipeline)
}

/**
 * The pipeline that runs after Twilio has been acked.
 *
 * MUST be handed to `waitUntil` rather than merely awaited: Vercel freezes the
 * invocation the moment the response is flushed, so plain post-response work stops
 * dead at its first await. v1.1.184 acked Twilio correctly — killing the 11200s —
 * and then silently dropped every lead for a day, because the handler's next line
 * after respondOk() was a Supabase round-trip that never resumed. The logs showed
 * `SMS from … to …` (synchronous, same tick) and nothing after it.
 *
 * Same pattern as deliverQuoteWithinBudget in _lib/quotes.ts.
 */
async function finishInboundSms(input: {
  body: Record<string, string>
  smsText: string
  fromNumber: string
  toNumber: string
}): Promise<void> {
  const { body, smsText, fromNumber, toNumber } = input

  try {
    console.log(`SMS from ${fromNumber} to ${toNumber}`)

    const { orgId } = await resolveOrgIdFromDid(supabase, toNumber)

    if (!orgId) {
      console.error('No org_id – lead rejected')
      await captureUnroutedInbound(supabase, {
        channel: 'sms',
        identifier: toNumber,
        reason: 'no_mapping',
        payload: body,
      })
      return
    }

    const { isFeatureEnabledForOrg } = await import('./_lib/featureSwitches.js')
    const inboundEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_sms')
    if (!inboundEnabled) {
      console.log(`Inbound SMS disabled for org ${orgId}`)
      return
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
      return
    }

    console.log(`Lead saved: ${leadId} with org ${orgId}`)
  } catch (err) {
    // Twilio was acked above, so nothing here can reach the caller — report it
    // instead of swallowing it.
    console.error('Unhandled error:', err)
    captureServerException(err, { route: '/api/inbound-sms', method: 'POST' })
  }
}

export default withObservability(handler)
