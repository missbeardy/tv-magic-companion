// Cron entry point for the voicemail fallback, mounted at
// /api/cron/voicemail-poll -> /api/inbound-email?action=voicemail-poll.
//
// Scheduled from .github/workflows/voicemail-poll-cron.yml rather than vercel.json,
// because Vercel Hobby only permits daily crons (same reason as contact-follow-up).
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { processVoicemail } from './processVoicemail.js'
import { safeCompareSecret } from './timingSafeCompare.js'
import {
  getVoicemailMailboxConfig,
  pollVoicemailMailbox,
  type PolledVoicemailOutcome,
} from './voicemailMailbox.js'

/**
 * Deliberately small. Each message is an IMAP download + storage upload + Whisper +
 * GPT extraction + lead insert + hookback SMS, against a 60s Hobby function ceiling.
 * The 5-minute cron cadence drains any backlog instead.
 */
const BATCH_SIZE = 2

export async function handleVoicemailPoll(
  req: VercelRequest,
  res: VercelResponse,
  supabase: SupabaseClient
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  const bearerPrefix = 'Bearer '
  const token =
    typeof authHeader === 'string' && authHeader.startsWith(bearerPrefix)
      ? authHeader.slice(bearerPrefix.length)
      : undefined
  if (!safeCompareSecret(token, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // One mailbox = one org. A polled message carries no CloudMailin plus-tag, and its
  // `To: "166"` is a 3CX extension rather than a DID, so there is nothing to resolve
  // from. Rather than guess an org, refuse to run.
  const orgId = process.env.VOICEMAIL_MAILBOX_ORG_ID?.trim()
  if (!orgId || !getVoicemailMailboxConfig()) {
    return res.status(200).json({ skipped: true, reason: 'not_configured' })
  }

  const callsEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_calls')
  if (!callsEnabled) {
    return res.status(200).json({ skipped: true, reason: 'inbound_calls_disabled' })
  }

  try {
    const summary = await pollVoicemailMailbox(BATCH_SIZE, async (message) => {
      try {
        const result = await processVoicemail({
          supabase,
          orgId,
          bodyText: message.bodyText,
          subject: message.subject,
          from: message.from,
          messageId: message.messageId,
          audio: message.audio,
          source: 'imap_poll',
          // Left null so the processor falls back to the called extension, matching
          // what the CloudMailin path records when there is no plus-tag.
          triggerIdentifier: null,
        })

        if (result.outcome === 'already_processed') {
          // Normal: CloudMailin got there first because the recording was short enough.
          return 'skipped' satisfies PolledVoicemailOutcome
        }

        console.log(`Voicemail poll: ${result.outcome} lead ${result.leadId}`)
        return 'processed' satisfies PolledVoicemailOutcome
      } catch (err) {
        console.error('Voicemail poll: processing failed, leaving for retry:', err)
        return 'failed' satisfies PolledVoicemailOutcome
      }
    })

    return res.status(200).json({ success: true, ...summary })
  } catch (err) {
    console.error('Voicemail poll failed:', err)
    return res.status(500).json({ error: 'Voicemail poll failed' })
  }
}
