// api/inbound-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import './_lib/loadLocalEnv.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { timingSafeEqual } from 'crypto'
import { processInboundLead } from './_lib/processInboundLead.js'
import { withObservability } from './_lib/observability.js'
import { insertRawFirstLead } from './_lib/rawFirstLead.js'
import { resolveOrgIdFromDid } from './_lib/resolveOrgFromDid.js'
import { captureUnroutedInbound } from './_lib/captureUnroutedInbound.js'
import { computeTwilioSignature } from './_lib/twilioSignature.js'
import { readRawBody } from './_lib/rawBody.js'
import { extractFromSms, loadOrgExtractionContext } from './_lib/extractLead.js'
import { checkRateLimit, rateLimitIdentifier } from './_lib/rateLimit.js'
import { captureServerException } from './_lib/sentry.js'
import { waitUntil } from '@vercel/functions'
import { matchInboundProbe, recordInboundProbeEcho } from './_lib/inboundProbe.js'
import { applyInboundSmsOptOut, recordSmsOptOut } from './_lib/smsOptOut.js'
import {
  claimMobileMessageInbound,
  parseMobileMessageWebhook,
  verifyMobileMessageSignature,
  type MobileMessageInboundEvent,
} from './_lib/mobileMessage.js'
import { formatAuPhoneForSms } from './_lib/phone.js'
import { threadInboundSms } from './_lib/threadInboundSms.js'
import { missingServerEnv } from './_lib/env.js'
import { maskPhone } from './_lib/redact.js'
import { log } from './_lib/log.js'

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

function headerValue(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

/**
 * Mobile Message webhooks (T1.18) — `?provider=mm`, on this existing hub because of the
 * 12-function Vercel cap. Inbound and delivery-status webhooks both land here; status can
 * be flagged with `&kind=status` but is also recognised from its payload.
 *
 * Unlike Twilio (which retry-storms on anything but 200), Mobile Message retries non-2xx
 * with backoff for ~4h, so a rejected or unconfigured request returns a real error code:
 * a genuine webhook sent while the secret was missing gets redelivered once it is set.
 */
async function handleMobileMessageWebhook(
  req: VercelRequest,
  res: VercelResponse,
  supabase: SupabaseClient,
  rawBytes: Buffer
): Promise<VercelResponse | void> {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const verdict = verifyMobileMessageSignature({
    secret: process.env.MOBILE_MESSAGE_WEBHOOK_SECRET,
    timestamp: headerValue(req, 'x-mm-timestamp'),
    signature: headerValue(req, 'x-mm-signature'),
    rawBody: rawBytes,
  })
  if (!verdict.ok) {
    if (verdict.reason === 'missing_secret') {
      console.error('Missing MOBILE_MESSAGE_WEBHOOK_SECRET — rejecting Mobile Message webhook')
      captureServerException(new Error('inbound-sms: MOBILE_MESSAGE_WEBHOOK_SECRET not set'), {
        provider: 'mobilemessage',
      })
      return res.status(503).json({ error: 'Webhook signing not configured' })
    }
    console.warn('Mobile Message webhook rejected:', verdict.reason)
    return res
      .status(verdict.reason === 'stale_timestamp' ? 400 : 401)
      .json({ error: verdict.reason === 'stale_timestamp' ? 'Stale timestamp' : 'Invalid signature' })
  }

  const kindHint = typeof req.query.kind === 'string' ? req.query.kind : undefined
  const event = parseMobileMessageWebhook(rawBytes.toString('utf8'), kindHint)

  if (event.kind === 'invalid') {
    // Signed by Mobile Message but not a shape we understand. A retry cannot fix that, so
    // 200 it (no retry storm) and leave a trace.
    console.warn('Mobile Message webhook ignored:', event.reason)
    return res.status(200).json({ ok: true, ignored: event.reason })
  }

  if (event.kind === 'status') {
    log.info('[MM_DELIVERY_STATUS]', {
      messageId: event.messageId,
      status: event.status,
      to: maskPhone(event.to),
      part: event.partNumber,
      totalParts: event.totalParts,
    })
    return res.status(200).json({ ok: true })
  }

  // Mobile Message allows 5s before it counts the delivery failed and retries. Ack first,
  // finish in waitUntil — same reasoning as the Twilio path below.
  res.status(200).json({ ok: true })

  if (event.kind === 'inbound') {
    if (!event.message.trim()) return
    const probe = matchInboundProbe(event.message)
    if (probe) {
      waitUntil(recordInboundProbeEcho(supabase, probe.nonce))
      return
    }
  }

  const pipeline = finishMobileMessageInbound(supabase, event)
  if (req.headers['x-inbound-await'] === '1') {
    await pipeline
    return
  }
  waitUntil(pipeline)
}

/** Post-ack half of a Mobile Message inbound/unsubscribe webhook. */
async function finishMobileMessageInbound(
  supabase: SupabaseClient,
  event: MobileMessageInboundEvent
): Promise<void> {
  try {
    if (!(await claimMobileMessageInbound(supabase, event))) {
      log.info('[MM_INBOUND_DUPLICATE]', { from: maskPhone(event.sender), receivedAt: event.receivedAt })
      return
    }

    // Mobile Message sends numbers as 61…; the rest of the pipeline (lead phone, threading,
    // opt-outs) stores and matches E.164 as Twilio delivers it.
    const fromNumber = formatAuPhoneForSms(event.sender)
    const toNumber = formatAuPhoneForSms(event.to)
    const body: Record<string, string> = {
      provider: 'mobilemessage',
      type: event.kind,
      to: toNumber,
      from: fromNumber,
      message: event.message,
      received_at: event.receivedAt,
      ...(event.originalMessageId ? { original_message_id: event.originalMessageId } : {}),
    }

    if (event.kind === 'unsubscribe') {
      const { orgId } = await resolveOrgIdFromDid(supabase, toNumber)
      if (!orgId) {
        await captureUnroutedInbound(supabase, {
          channel: 'sms',
          identifier: toNumber,
          reason: 'no_mapping',
          payload: body,
        })
        return
      }
      await recordSmsOptOut({
        supabase,
        orgId,
        fromNumber,
        source: 'mobilemessage_unsubscribe',
        note: 'Customer opted out (Mobile Message)',
      })
      return
    }

    await finishInboundSms({ supabase, body, smsText: event.message, fromNumber, toNumber })
  } catch (err) {
    console.error('Unhandled error (Mobile Message inbound):', err)
    captureServerException(err, { route: '/api/inbound-sms', provider: 'mobilemessage' })
  }
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : undefined
  const isMobileMessage = req.query.provider === 'mm'

  // Body parser is disabled (see `config` above); read the raw stream once.
  const rawBytes = await readRawBody(req)
  const rawBody = rawBytes.toString('utf8')

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    captureServerException(new Error('inbound-sms: server not configured'), {
      missing: missingServerEnv().join(','),
      action: action ?? (isMobileMessage ? 'mobilemessage' : 'sms'),
    })
    if (action === 'meta-webhook' || isMobileMessage) {
      // Mobile Message retries non-2xx for ~4h, so a 503 here is recoverable.
      return res.status(503).json({ error: 'Server not configured' })
    }
    // Twilio needs a 200 + TwiML ack regardless of backend health, or it retry-storms.
    return respondOk(res)
  }

  if (action === 'meta-webhook') {
    const { handleMetaWebhook } = await import('./_lib/metaWebhook.js')
    return handleMetaWebhook(req, res, supabase, rawBody)
  }

  if (isMobileMessage) {
    return handleMobileMessageWebhook(req, res, supabase, rawBytes)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Twilio posts application/x-www-form-urlencoded. Reconstruct the params
  // object the rest of this handler (and verifyTwilioSignature) expects.
  req.body = Object.fromEntries(new URLSearchParams(rawBody))

  const identifier = rateLimitIdentifier(req.headers)
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

  // The synthetic probe stops here. It exists to prove this continuation runs at all, so
  // it must travel the same waitUntil path as a real enquiry — and must never create a
  // lead, assign a technician or notify anyone.
  const probe = matchInboundProbe(smsText)
  if (probe) {
    waitUntil(recordInboundProbeEcho(supabase, probe.nonce))
    return
  }

  const pipeline = finishInboundSms({ supabase, body, smsText, fromNumber, toNumber })

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
  supabase: SupabaseClient
  body: Record<string, string>
  smsText: string
  fromNumber: string
  toNumber: string
}): Promise<void> {
  const { supabase, body, smsText, fromNumber, toNumber } = input

  try {
    log.info('SMS received', { from: maskPhone(fromNumber), to: toNumber })

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

    const optOutResult = await applyInboundSmsOptOut({
      supabase,
      orgId,
      fromNumber,
      smsText,
    })
    if (optOutResult === 'handled') return

    const { isFeatureEnabledForOrg } = await import('./_lib/featureSwitches.js')
    const inboundEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_sms')
    if (!inboundEnabled) {
      log.info('Inbound SMS disabled for org', { orgId })
      return
    }

    const threaded = await threadInboundSms({
      supabase,
      orgId,
      fromNumber,
      smsText,
      toNumber,
    })
    if (threaded) {
      log.info('SMS threaded onto lead', { leadId: threaded.leadId, orgId })
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
          const { fields: parsed, status } = await extractFromSms(
            smsText,
            fromNumber,
            await loadOrgExtractionContext(supabase, orgId)
          )
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

    log.info('Lead saved', { leadId, orgId })
  } catch (err) {
    // Twilio was acked above, so nothing here can reach the caller — report it
    // instead of swallowing it.
    console.error('Unhandled error:', err)
    captureServerException(err, { route: '/api/inbound-sms', method: 'POST' })
  }
}

export default withObservability(handler)
