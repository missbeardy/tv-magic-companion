// FieldBourne ops forwards admin@fieldbourne → CloudMailin plus-address; tag resolves org.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import './_lib/loadLocalEnv.js'
import { createClient } from '@supabase/supabase-js'
import { isFeatureEnabledForOrg } from './_lib/featureSwitches.js'
import { resolveOrgIdFromInboundEmail, resolveOrgIdFromCloudmailinWebhook } from './_lib/resolveOrgFromInboundEmail.js'
import { captureUnroutedInbound } from './_lib/captureUnroutedInbound.js'
import { processInboundLead } from './_lib/processInboundLead.js'
import { withObservability } from './_lib/observability.js'
import { extractFromEmail } from './_lib/extractLead.js'
import {
  insertRawFirstLead,
  parseEmailSender,
  type ExtractedLeadFields,
} from './_lib/rawFirstLead.js'
import {
  extractVoicemailMetadata,
  isVoicemailAudio,
  processVoicemail,
} from './_lib/processVoicemail.js'
import { safeCompareSecret } from './_lib/timingSafeCompare.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface CloudmailinAttachment {
  file_name?: string
  content_type?: string
  content?: string
  url?: string
  size?: number
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : undefined
  if (action === 'facebook-lead') {
    const { handleInboundFacebookLead } = await import('./_lib/handleInboundFacebookLead.js')
    return handleInboundFacebookLead(req, res, supabase)
  }
  if (action === 'voicemail-poll') {
    // Lazily imported so the CloudMailin hot path never loads the IMAP client.
    const { handleVoicemailPoll } = await import('./_lib/handleVoicemailPoll.js')
    return handleVoicemailPoll(req, res, supabase)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // CloudMailin's target config only supports a plain URL + POST format (no
  // custom headers), so auth is passed via HTTP Basic Auth in the URL
  // userinfo (https://user:pass@host/...), which CloudMailin sends as a real
  // Authorization header rather than a loggable query string.
  const authHeader = req.headers.authorization
  const basicPrefix = 'Basic '
  const incomingPassword =
    typeof authHeader === 'string' && authHeader.startsWith(basicPrefix)
      ? Buffer.from(authHeader.slice(basicPrefix.length), 'base64').toString('utf8').split(':').slice(1).join(':')
      : undefined
  if (!safeCompareSecret(incomingPassword, process.env.INBOUND_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { plain, html, headers, attachments } = req.body as {
    plain?: string
    html?: string
    headers?: Record<string, string>
    attachments?: CloudmailinAttachment[]
  }

  const emailText = plain || html?.replace(/<[^>]+>/g, ' ') || ''
  const subject = req.body.subject || headers?.subject || 'No Subject'
  const from = req.body.from || headers?.from || 'Unknown Sender'
  const simulatedTranscript =
    typeof (req.body as Record<string, unknown>).simulated_transcript === 'string'
      ? String((req.body as Record<string, unknown>).simulated_transcript).trim()
      : ''

  // ── Voicemail branch ──────────────────────────────────────────
  // Only reaches here for recordings under ~25s; anything longer is rejected by
  // CloudMailin's 524,288-byte cap and picked up instead by the IMAP poller
  // (action=voicemail-poll). Both call the same processVoicemail().
  const voicemailAttachment = attachments?.find((att) =>
    isVoicemailAudio(att.content_type, att.file_name)
  )

  if (voicemailAttachment) {
    const metadataPreview = extractVoicemailMetadata(subject, emailText)
    const orgResolution = await resolveOrgIdFromCloudmailinWebhook(
      supabase,
      req.body,
      metadataPreview.calledNumber
    )
    if (orgResolution.source === 'unresolved') {
      console.error(`Voicemail email: org not resolved (${orgResolution.reason})`)
      await captureUnroutedInbound(supabase, {
        channel: 'voicemail',
        identifier: orgResolution.tag ?? metadataPreview.calledNumber,
        reason:
          orgResolution.reason === 'no_tag' || orgResolution.reason === 'unknown_tag'
            ? orgResolution.reason
            : 'no_mapping',
        payload: req.body,
      })
      return res.status(200).json({ skipped: true, reason: 'no_org' })
    }
    const orgId = orgResolution.orgId

    const callsEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_calls')
    if (!callsEnabled) {
      console.log(`Inbound calls/voicemail disabled for org ${orgId}`)
      return res.status(200).json({ skipped: true, reason: 'inbound_calls_disabled' })
    }

    try {
      // Resolve the audio to a buffer here so the processor stays transport-neutral.
      let audio = null
      if (voicemailAttachment.content) {
        audio = {
          buffer: Buffer.from(voicemailAttachment.content, 'base64'),
          fileName: voicemailAttachment.file_name || 'voicemail.wav',
          contentType: voicemailAttachment.content_type || 'audio/wav',
        }
      } else if (voicemailAttachment.url) {
        const audioRes = await fetch(voicemailAttachment.url)
        audio = {
          buffer: Buffer.from(await audioRes.arrayBuffer()),
          fileName: voicemailAttachment.file_name || 'voicemail.wav',
          contentType: voicemailAttachment.content_type || 'audio/wav',
        }
      }

      const result = await processVoicemail({
        supabase,
        orgId,
        bodyText: emailText,
        subject,
        from,
        messageId: headers?.['message-id'] ?? null,
        audio,
        source: 'cloudmailin',
        simulatedTranscript: simulatedTranscript || undefined,
        triggerIdentifier: orgResolution.tag ?? metadataPreview.calledNumber,
      })

      switch (result.outcome) {
        case 'already_processed':
          console.log('Voicemail already handled by the mailbox poller:', result.dedupKey)
          return res.status(200).json({ skipped: true, reason: 'already_processed' })
        case 'enriched_existing':
          return res.status(200).json({
            success: true,
            action: 'enriched_existing',
            lead_id: result.leadId,
            extraction_status: result.extractionStatus,
            type: 'voicemail',
          })
        case 'logged_to_existing':
          return res.status(200).json({
            success: true,
            action: 'logged_to_existing',
            lead_id: result.leadId,
            type: 'voicemail',
          })
        default:
          console.log('Voicemail lead created:', result.leadId)
          return res.status(200).json({
            success: true,
            lead_id: result.leadId,
            type: 'voicemail',
            hookbackSent: result.hookbackSent,
            transcription_failed: result.transcriptionFailed,
            ...(result.partial ? { partial: true } : {}),
          })
      }
    } catch (err) {
      console.error('Voicemail processing error:', err)
      return res.status(500).json({ error: 'Voicemail processing failed' })
    }
  }

  // ── Normal email-lead branch — org from CloudMailin plus-tag ───
  if (!emailText.trim()) {
    console.error('Empty email body received from CloudMailin')
    return res.status(200).json({ received: true })
  }

  const orgResolution = await resolveOrgIdFromInboundEmail(supabase, req.body)
  if (orgResolution.source === 'unresolved') {
    console.error(`Inbound email: org not resolved (${orgResolution.reason})`)
    await captureUnroutedInbound(supabase, {
      channel: 'email',
      identifier: orgResolution.tag,
      reason: orgResolution.reason,
      payload: req.body,
    })
    return res.status(200).json({ skipped: true, reason: orgResolution.reason, tag: orgResolution.tag })
  }
  if (!orgResolution.orgId) {
    return res.status(200).json({ skipped: true, reason: 'no_org', tag: orgResolution.tag })
  }
  const orgId = orgResolution.orgId

  const emailEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_email')
  if (!emailEnabled) {
    console.log(`Inbound email disabled for org ${orgId}`)
    return res.status(200).json({ skipped: true, reason: 'inbound_email_disabled' })
  }

  try {
    const { name: senderName, email: senderEmail } = parseEmailSender(from)
    let extractedForAck: ExtractedLeadFields = {}

    let result
    try {
      result = await processInboundLead({
        supabase,
        orgId,
        insertLead: () =>
          insertRawFirstLead(supabase, orgId, {
            org_id: orgId,
            name: senderName,
            phone: null,
            email: senderEmail || from,
            service_type: 'General Enquiry',
            details: subject || 'Inbound email enquiry',
            address: null,
            source: 'email',
            raw_email: emailText,
          }),
        createdEvent: {
          note: 'Lead captured from inbound email (raw-first)',
          payload: {
            source: 'email',
            from,
            subject,
            inbound_tag: orgResolution.tag,
            routing: orgResolution.source,
          },
        },
        extract: async () => {
          const { fields: extracted, status } = await extractFromEmail(emailText, subject, from)
          extractedForAck = extracted
          return {
            updateFields: {
              name: extracted.name || senderName,
              phone: extracted.phone,
              email: extracted.email || senderEmail || undefined,
              service_type: extracted.service_type || 'General Enquiry',
              details: extracted.details || subject || 'Inbound email enquiry',
              address: extracted.address,
            },
            extractionStatus: status,
          }
        },
        selectColumns: 'name, service_type, status, phone, email, address',
        buildNotify: ({ savedLead }) => ({
          name: savedLead?.name || senderName,
          service_type: savedLead?.service_type || 'General Enquiry',
          status: savedLead?.status || 'unassigned',
        }),
        followUp: {
          type: 'ack',
          source: 'email',
          resolvePhone: ({ savedLead }) =>
            extractedForAck.phone?.trim() || savedLead?.phone?.trim() || null,
          resolveEmail: ({ savedLead }) =>
            extractedForAck.email?.trim() || savedLead?.email?.trim() || senderEmail || null,
          resolveCustomerName: ({ savedLead }) => savedLead?.name || senderName,
        },
        logLabel: 'inbound email',
        run: {
          workflowKey: 'inbound_lead',
          triggerChannel: 'email',
          triggerSummary: { identifier: orgResolution.tag, source: 'email' },
        },
      })
    } catch (insertErr) {
      console.error('Email raw-first insert failed:', insertErr)
      return res.status(500).json({ error: 'Failed to save lead' })
    }

    console.log('Lead successfully created via CloudMailin:', result.savedLead?.name || from)

    return res.status(200).json({
      success: true,
      lead_id: result.leadId,
      ...(result.partial ? { partial: true } : {}),
    })
  } catch (err) {
    console.error('Inbound email processing error:', err)
    return res.status(500).json({ error: 'Processing failed' })
  }
}

export default withObservability(handler)
