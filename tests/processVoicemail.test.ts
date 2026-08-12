import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  extractVoicemailMetadata,
  isVoicemailAudio,
  looksLikeVoicemailNotification,
  processVoicemail,
  voicemailDedupKey,
  MAX_VOICEMAIL_BYTES,
} from '../api/_lib/processVoicemail'
import {
  buildPcmWav,
  VOICEMAIL_BODY,
  VOICEMAIL_FILE_NAME,
  VOICEMAIL_FROM,
  VOICEMAIL_MESSAGE_ID,
  VOICEMAIL_SUBJECT,
} from './fixtures/voicemailEmail'

vi.mock('../api/_lib/processInboundLead.js', () => ({
  processInboundLead: vi.fn(),
}))
vi.mock('../api/_lib/rawFirstLead.js', () => ({
  insertRawFirstLead: vi.fn(),
}))
vi.mock('../api/_lib/inboundLeadDedup.js', () => ({
  findRecentLeadByPhone: vi.fn(),
}))
vi.mock('../api/_lib/extractLead.js', () => ({
  extractFromVoicemailTranscript: vi.fn(),
}))
vi.mock('../api/_lib/retryLeadExtraction.js', () => ({
  canEnrichLeadFromVoicemail: vi.fn(),
  enrichLeadFromVoicemailTranscript: vi.fn(),
}))

import { processInboundLead } from '../api/_lib/processInboundLead'
import { findRecentLeadByPhone } from '../api/_lib/inboundLeadDedup'
import { extractFromVoicemailTranscript } from '../api/_lib/extractLead'
import {
  canEnrichLeadFromVoicemail,
  enrichLeadFromVoicemailTranscript,
} from '../api/_lib/retryLeadExtraction'

const mockProcessInboundLead = vi.mocked(processInboundLead)
const mockFindRecentLead = vi.mocked(findRecentLeadByPhone)
const mockExtract = vi.mocked(extractFromVoicemailTranscript)
const mockCanEnrich = vi.mocked(canEnrichLeadFromVoicemail)
const mockEnrich = vi.mocked(enrichLeadFromVoicemailTranscript)

const ORG_ID = '11111111-1111-1111-1111-111111111111'

interface FakeRow {
  [key: string]: unknown
}

function createDb() {
  return {
    lead_voicemails: [] as FakeRow[],
    lead_events: [] as FakeRow[],
    leads: [] as FakeRow[],
    uploads: [] as { bucket: string; path: string; size: number; contentType?: string }[],
  }
}

/**
 * Minimal Supabase double. The important behaviour is the UNIQUE constraint on
 * rfc_message_id — that is what makes the claim-insert act as the cross-transport
 * lock, so the duplicate test is only meaningful if the double enforces it.
 */
function createSupabase(db: ReturnType<typeof createDb>, opts: { uploadError?: string } = {}) {
  let sequence = 0

  const client = {
    from(table: string) {
      const rows = () => (db as unknown as Record<string, FakeRow[]>)[table] ?? []

      return {
        insert(values: FakeRow) {
          const run = () => {
            if (table === 'lead_voicemails') {
              const clash = db.lead_voicemails.some(
                (r) => r.rfc_message_id === values.rfc_message_id
              )
              if (clash) {
                return { data: null, error: { code: '23505', message: 'duplicate key value' } }
              }
              const row = { id: `vm-${++sequence}`, ...values }
              db.lead_voicemails.push(row)
              return { data: row, error: null }
            }
            rows().push(values)
            return { data: values, error: null }
          }

          return {
            select: () => ({ single: async () => run() }),
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
          }
        },
        update(values: FakeRow) {
          return {
            eq: async (column: string, value: unknown) => {
              rows()
                .filter((r) => r[column] === value)
                .forEach((r) => Object.assign(r, values))
              return { error: null }
            },
          }
        },
        delete() {
          return {
            eq: async (column: string, value: unknown) => {
              const kept = rows().filter((r) => r[column] !== value)
              ;(db as unknown as Record<string, FakeRow[]>)[table] = kept
              return { error: null }
            },
          }
        },
      }
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, buffer: Buffer, options?: { contentType?: string }) => {
          if (opts.uploadError) return { error: { message: opts.uploadError } }
          db.uploads.push({ bucket, path, size: buffer.length, contentType: options?.contentType })
          return { error: null }
        },
      }),
    },
  }

  return client as unknown as import('@supabase/supabase-js').SupabaseClient
}

function voicemailInput(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  overrides: Partial<Parameters<typeof processVoicemail>[0]> = {}
): Parameters<typeof processVoicemail>[0] {
  return {
    supabase,
    orgId: ORG_ID,
    bodyText: VOICEMAIL_BODY,
    subject: VOICEMAIL_SUBJECT,
    from: VOICEMAIL_FROM,
    messageId: VOICEMAIL_MESSAGE_ID,
    audio: {
      buffer: buildPcmWav(),
      fileName: VOICEMAIL_FILE_NAME,
      contentType: 'audio/wav',
    },
    source: 'cloudmailin',
    ...overrides,
  }
}

describe('extractVoicemailMetadata', () => {
  it('parses the real 3CX notification body', () => {
    const metadata = extractVoicemailMetadata(VOICEMAIL_SUBJECT, VOICEMAIL_BODY)

    expect(metadata.phone).toBe('0400000000')
    expect(metadata.calledNumber).toBe('166')
    expect(metadata.extensionName).toBe('TV Magic VM')
    expect(metadata.duration).toBe('00:00:26')
    expect(metadata.receivedAt).toBe('Monday, July 27, 2026 11:55:14 AM')
    expect(metadata.fileRef).toBe('vmail_0400000000_166_20260727015014')
  })

  // Documents a pre-existing quirk carried over unchanged from api/inbound-email.ts:
  // the subject fallback's character class includes '-' and space, so it swallows
  // 3CX's "<number> - <number>" duplication. Harmless in practice — real 3CX mail
  // always carries a From: line, which takes precedence — but pinned here so the
  // behaviour cannot drift silently.
  it('falls back to the subject when the body has no From line', () => {
    const metadata = extractVoicemailMetadata(VOICEMAIL_SUBJECT, 'no fields here')
    expect(metadata.phone).toBe('0400000000 - 0400000000')
    expect(metadata.calledNumber).toBeNull()
  })
})

describe('voicemailDedupKey', () => {
  it('prefers the RFC Message-ID, which survives Gmail auto-forward', () => {
    const metadata = extractVoicemailMetadata(VOICEMAIL_SUBJECT, VOICEMAIL_BODY)
    expect(voicemailDedupKey(VOICEMAIL_MESSAGE_ID, metadata)).toBe(VOICEMAIL_MESSAGE_ID)
  })

  it('derives a stable synthetic key when Message-ID is missing', () => {
    const metadata = extractVoicemailMetadata(VOICEMAIL_SUBJECT, VOICEMAIL_BODY)
    const first = voicemailDedupKey(null, metadata)
    const second = voicemailDedupKey('   ', metadata)

    expect(first).toMatch(/^synthetic:[a-f0-9]{64}$/)
    expect(second).toBe(first)

    const other = voicemailDedupKey(null, { ...metadata, fileRef: 'vmail_other_166_2026' })
    expect(other).not.toBe(first)
  })
})

describe('looksLikeVoicemailNotification', () => {
  it('accepts a real 3CX notification', () => {
    expect(looksLikeVoicemailNotification(VOICEMAIL_SUBJECT, VOICEMAIL_BODY)).toBe(true)
  })

  it('accepts one with only the File reference', () => {
    expect(
      looksLikeVoicemailNotification('', 'File:"vmail_0400000000_166_20260727015014"')
    ).toBe(true)
  })

  // The poller trusts the Gmail label rather than a subject match, so a stray labelled
  // email carrying audio would otherwise become a junk "Missed Call" lead.
  it('rejects an unrelated email that happens to carry an audio attachment', () => {
    expect(
      looksLikeVoicemailNotification('Your podcast episode', 'Here is the recording, thanks!')
    ).toBe(false)
  })
})

describe('isVoicemailAudio', () => {
  it('matches on content type or filename extension', () => {
    expect(isVoicemailAudio('audio/wav', 'x.bin')).toBe(true)
    expect(isVoicemailAudio('application/octet-stream', 'vmail_1.wav')).toBe(true)
    expect(isVoicemailAudio('image/png', 'icon.png')).toBe(false)
  })
})

describe('processVoicemail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindRecentLead.mockResolvedValue(null)
    mockExtract.mockResolvedValue({ fields: { name: 'Jane' }, status: 'succeeded' })
    mockCanEnrich.mockReturnValue(true)
    mockProcessInboundLead.mockResolvedValue({
      leadId: 'lead-1',
      savedLead: { id: 'lead-1', name: 'Jane' },
      hookbackSent: true,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Hi, my TV needs mounting.' }),
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores the recording and creates a lead', async () => {
    const db = createDb()
    const supabase = createSupabase(db)

    const result = await processVoicemail(voicemailInput(supabase))

    expect(result).toMatchObject({ outcome: 'created', leadId: 'lead-1', transcriptionFailed: false })
    expect(db.uploads).toHaveLength(1)
    expect(db.uploads[0].bucket).toBe('lead-voicemails')
    // First path segment must be the org id — that is the storage RLS boundary.
    expect(db.uploads[0].path.startsWith(`${ORG_ID}/`)).toBe(true)

    expect(db.lead_voicemails).toHaveLength(1)
    expect(db.lead_voicemails[0]).toMatchObject({
      lead_id: 'lead-1',
      org_id: ORG_ID,
      rfc_message_id: VOICEMAIL_MESSAGE_ID,
      source: 'cloudmailin',
      transcription_status: 'succeeded',
      duration_text: '00:00:26',
      received_text: 'Monday, July 27, 2026 11:55:14 AM',
    })
  })

  it('uploads the audio before transcribing, so Whisper failures keep the recording', async () => {
    const db = createDb()
    const supabase = createSupabase(db)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'whisper down' })
    )

    const result = await processVoicemail(voicemailInput(supabase))

    expect(result).toMatchObject({ outcome: 'created', transcriptionFailed: true })
    expect(db.uploads).toHaveLength(1)
    expect(db.lead_voicemails[0]).toMatchObject({
      transcription_status: 'failed',
      lead_id: 'lead-1',
    })
    expect(db.lead_voicemails[0].storage_path).toBeTruthy()
    // No transcript, so no AI extraction should have been attempted.
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('processes the same voicemail exactly once across both transports', async () => {
    const db = createDb()
    const supabase = createSupabase(db)

    // CloudMailin gets there first (recording was short enough to be forwarded).
    const first = await processVoicemail(voicemailInput(supabase, { source: 'cloudmailin' }))
    // Then the poller sees the same message in the mailbox.
    const second = await processVoicemail(voicemailInput(supabase, { source: 'imap_poll' }))

    expect(first.outcome).toBe('created')
    expect(second).toEqual({ outcome: 'already_processed', dedupKey: VOICEMAIL_MESSAGE_ID })

    expect(mockProcessInboundLead).toHaveBeenCalledTimes(1)
    expect(db.lead_voicemails).toHaveLength(1)
    expect(db.uploads).toHaveLength(1)
    // The bug this guards against: a second pass logging "Another voicemail from ...".
    expect(db.lead_events.filter((e) => e.event_type === 'missed_call_again')).toHaveLength(0)
  })

  it('attaches to a recent lead and enriches it instead of creating a duplicate', async () => {
    const db = createDb()
    const supabase = createSupabase(db)
    mockFindRecentLead.mockResolvedValue({
      id: 'lead-existing',
      name: 'Missed Call',
      extraction_status: 'failed',
    })
    mockEnrich.mockResolvedValue({ status: 'succeeded' } as Awaited<ReturnType<typeof enrichLeadFromVoicemailTranscript>>)

    const result = await processVoicemail(voicemailInput(supabase))

    expect(result).toMatchObject({ outcome: 'enriched_existing', leadId: 'lead-existing' })
    expect(mockProcessInboundLead).not.toHaveBeenCalled()
    expect(db.lead_voicemails[0].lead_id).toBe('lead-existing')
  })

  it('drops the claim when the upload fails so the next run can retry', async () => {
    const db = createDb()
    const supabase = createSupabase(db, { uploadError: 'bucket unavailable' })

    await expect(processVoicemail(voicemailInput(supabase))).rejects.toThrow(/upload failed/i)

    expect(db.lead_voicemails).toHaveLength(0)
    expect(mockProcessInboundLead).not.toHaveBeenCalled()
  })

  it('rejects audio beyond the Whisper limit before claiming anything', async () => {
    const db = createDb()
    const supabase = createSupabase(db)
    const oversized = {
      buffer: Buffer.alloc(MAX_VOICEMAIL_BYTES + 1),
      fileName: VOICEMAIL_FILE_NAME,
      contentType: 'audio/wav',
    }

    await expect(
      processVoicemail(voicemailInput(supabase, { audio: oversized }))
    ).rejects.toThrow(/exceeds/i)

    expect(db.lead_voicemails).toHaveLength(0)
    expect(db.uploads).toHaveLength(0)
  })
})
