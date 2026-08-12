// IMAP reader for 3CX voicemail mail that CloudMailin refused.
//
// Why IMAP and not the Gmail API: the mailbox is a personal @gmail.com account, so an
// OAuth app using Gmail's restricted scopes would sit in "Testing" publishing status,
// where refresh tokens expire after 7 days — the poller would die every week. An app
// password over IMAP has no such expiry and needs no Google verification review.
//
// It also removes all MIME work: the IMAP server reports BODYSTRUCTURE, so we ask it
// which part is the audio and `downloadMany` hands back the already-decoded bytes.
import { ImapFlow, type MessageStructureObject } from 'imapflow'
import { isVoicemailAudio, looksLikeVoicemailNotification } from './processVoicemail.js'

/**
 * Custom IMAP keyword marking a message this poller has finished with. It is only an
 * optimisation to keep the search small — the UNIQUE rfc_message_id in lead_voicemails
 * is what actually prevents double-processing, so a failed keyword write is harmless.
 */
const PROCESSED_KEYWORD = 'fieldbourneVoicemailDone'

/** Bounds the IMAP search; nothing older than this is worth chasing. */
const LOOKBACK_DAYS = 14

export interface VoicemailMailboxConfig {
  host: string
  user: string
  password: string
  folder: string
}

export function getVoicemailMailboxConfig(): VoicemailMailboxConfig | null {
  const host = process.env.VOICEMAIL_IMAP_HOST?.trim()
  const user = process.env.VOICEMAIL_IMAP_USER?.trim()
  const password = process.env.VOICEMAIL_IMAP_APP_PASSWORD?.trim()
  // Gmail exposes each label as an IMAP folder, and a NESTED label is 'Parent/Child'
  // with the display name and spacing preserved — not the hyphenated slug Gmail shows
  // in its URL bar. Getting this wrong is why the first prod run 500'd.
  const folder =
    process.env.VOICEMAIL_IMAP_FOLDER?.trim() || 'TVMagic Sales Lead/VoiceMail Lead'

  if (!host || !user || !password) return null
  return { host, user, password, folder }
}

export interface PolledVoicemail {
  uid: number
  messageId: string | null
  subject: string
  from: string
  bodyText: string
  audio: { buffer: Buffer; fileName: string; contentType: string } | null
}

export type PolledVoicemailOutcome = 'processed' | 'skipped' | 'failed'

export interface VoicemailPollSummary {
  examined: number
  processed: number
  skipped: number
  failed: number
}

/** Depth-first walk of the BODYSTRUCTURE tree. */
function flattenParts(node: MessageStructureObject): MessageStructureObject[] {
  if (!node.childNodes?.length) return [node]
  return node.childNodes.flatMap(flattenParts)
}

/**
 * Choose the body text and audio parts from a BODYSTRUCTURE tree. Exported for tests:
 * this is the only piece of MIME reasoning left, since the IMAP server does the rest.
 */
export function pickVoicemailParts(structure: MessageStructureObject) {
  const parts = flattenParts(structure)
  const textPart = parts.find((p) => p.part && p.type === 'text/plain')
  const audioPart = parts.find(
    (p) => p.part && isVoicemailAudio(p.type, p.dispositionParameters?.filename ?? p.parameters?.name)
  )
  return { textPart, audioPart }
}

/**
 * Read up to `limit` unprocessed voicemails and hand each to `onMessage`.
 *
 * The connection lifecycle stays in here so callers never leak a socket. Messages are
 * processed oldest-first, and only marked when the handler reports a terminal outcome —
 * a failure is left untouched so the next cron run retries it.
 */
export async function pollVoicemailMailbox(
  limit: number,
  onMessage: (message: PolledVoicemail) => Promise<PolledVoicemailOutcome>
): Promise<VoicemailPollSummary> {
  const config = getVoicemailMailboxConfig()
  if (!config) throw new Error('Voicemail mailbox is not configured')

  const summary: VoicemailPollSummary = { examined: 0, processed: 0, skipped: 0, failed: 0 }

  const client = new ImapFlow({
    host: config.host,
    port: 993,
    secure: true,
    auth: { user: config.user, pass: config.password },
    logger: false,
  })

  await client.connect()

  // A wrong folder name otherwise surfaces as an opaque 500 in the cron log. Naming
  // the available paths turns it into a one-line fix — Gmail's URL slug for a label
  // is not its IMAP path, which is the mistake that broke the first prod run.
  let lock
  try {
    lock = await client.getMailboxLock(config.folder)
  } catch (err) {
    const paths = await client
      .list()
      .then((boxes) => boxes.map((b) => b.path).join(', '))
      .catch(() => 'unavailable')
    await client.logout().catch(() => client.close())
    throw new Error(
      `Voicemail mailbox folder ${JSON.stringify(config.folder)} could not be opened ` +
        `(${err instanceof Error ? err.message : String(err)}). Available: ${paths}`
    )
  }

  try {
    // No subject constraint: the Gmail label is already the filter, and matching on
    // 3CX's exact subject wording would mean a silent, total stop if they ever
    // reworded it. Messages that turn out not to be voicemails are recognised by
    // content below and marked, so a mislabelled mail costs one wasted fetch.
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    const found = await client.search({ unKeyword: PROCESSED_KEYWORD, since }, { uid: true })
    const uids = (found || []).sort((a, b) => a - b).slice(0, limit)
    if (uids.length === 0) return summary

    const messages = await client.fetchAll(uids, { envelope: true, bodyStructure: true }, { uid: true })

    for (const message of messages) {
      summary.examined += 1
      const uid = message.uid

      try {
        let bodyText = ''
        let audio: PolledVoicemail['audio'] = null

        if (message.bodyStructure) {
          const { textPart, audioPart } = pickVoicemailParts(message.bodyStructure)
          const wanted = [textPart?.part, audioPart?.part].filter((p): p is string => !!p)

          if (wanted.length > 0) {
            // Transfer-encoding is decoded by imapflow, so these are real bytes.
            const downloaded = await client.downloadMany(String(uid), wanted, { uid: true })

            if (textPart?.part) {
              const content = downloaded[textPart.part]?.content
              const charset = textPart.parameters?.charset || 'utf-8'
              bodyText = content
                ? new TextDecoder(charset.toLowerCase()).decode(content)
                : ''
            }

            if (audioPart?.part) {
              const entry = downloaded[audioPart.part]
              if (entry?.content) {
                audio = {
                  buffer: entry.content,
                  fileName:
                    entry.meta?.filename ||
                    audioPart.dispositionParameters?.filename ||
                    audioPart.parameters?.name ||
                    'voicemail.wav',
                  contentType: entry.meta?.contentType || audioPart.type || 'audio/wav',
                }
              }
            }
          }
        }

        const subject = message.envelope?.subject ?? ''

        if (!audio) {
          // Not a voicemail after all. Mark it so the search does not keep returning it.
          console.warn(`Voicemail poll: no audio part on uid ${uid}, marking handled`)
          summary.skipped += 1
          await markProcessed(client, uid)
          continue
        }

        // Guards against a stray labelled email that happens to carry audio: without
        // 3CX's fields it would parse to an unknown caller and create a junk lead.
        if (!looksLikeVoicemailNotification(subject, bodyText)) {
          console.warn(`Voicemail poll: uid ${uid} has audio but no 3CX fields, marking handled`)
          summary.skipped += 1
          await markProcessed(client, uid)
          continue
        }

        const outcome = await onMessage({
          uid,
          messageId: message.envelope?.messageId ?? null,
          subject: subject || 'New Voicemail',
          from: message.envelope?.from?.[0]?.address ?? 'noreply@3cx.net',
          bodyText,
          audio,
        })

        if (outcome === 'failed') {
          summary.failed += 1
          continue
        }

        summary[outcome === 'processed' ? 'processed' : 'skipped'] += 1
        await markProcessed(client, uid)
      } catch (err) {
        summary.failed += 1
        console.error(`Voicemail poll: uid ${uid} failed, leaving for retry:`, err)
      }
    }

    return summary
  } finally {
    lock.release()
    await client.logout().catch(() => client.close())
  }
}

async function markProcessed(client: ImapFlow, uid: number): Promise<void> {
  try {
    await client.messageFlagsAdd(String(uid), [PROCESSED_KEYWORD], { uid: true })
  } catch (err) {
    // Non-fatal: the DB unique constraint still prevents a duplicate on re-read.
    console.warn(`Voicemail poll: could not mark uid ${uid} processed:`, err)
  }
}
