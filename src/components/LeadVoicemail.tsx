import { useEffect, useState } from 'react'
import {
  fetchLeadVoicemails,
  formatVoicemailDuration,
  signLeadVoicemailPath,
  type LeadVoicemail as LeadVoicemailRow,
} from '../lib/leadVoicemailStorage'

interface Props {
  leadId: string
}

/**
 * Plays the voicemail recording attached to a lead.
 *
 * The recordings are PCM mono 8 kHz 16-bit WAV, which every browser decodes
 * natively — but the <audio> onError fallback stays so a codec change at the PBX
 * degrades to a download rather than a dead player.
 */
export default function LeadVoicemail({ leadId }: Props) {
  const [voicemails, setVoicemails] = useState<LeadVoicemailRow[]>([])
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map())
  const [unplayable, setUnplayable] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    async function load() {
      const rows = await fetchLeadVoicemails(leadId)
      if (cancelled) return
      setVoicemails(rows)

      const urls = new Map<string, string>()
      for (const row of rows) {
        if (!row.storage_path) continue
        const signed = await signLeadVoicemailPath(row.storage_path)
        if (signed) urls.set(row.id, signed)
      }
      if (!cancelled) setSignedUrls(urls)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [leadId])

  if (voicemails.length === 0) return null

  return (
    <div className="mt-3 space-y-2">
      {voicemails.map((row) => {
        const src = signedUrls.get(row.id)
        const duration = formatVoicemailDuration(row.duration_text)

        return (
          <div key={row.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-700">
                Voicemail{row.caller_phone ? ` from ${row.caller_phone}` : ''}
                {duration ? ` · ${duration}` : ''}
              </span>
              {row.transcription_status === 'failed' && (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                  No transcript
                </span>
              )}
            </div>

            {row.received_text && (
              <p className="text-[11px] text-gray-500 mb-2">{row.received_text}</p>
            )}

            {!src ? (
              <p className="text-xs text-gray-500">Recording unavailable.</p>
            ) : unplayable.has(row.id) ? (
              <a
                href={src}
                download={row.file_name || 'voicemail.wav'}
                className="inline-block text-xs font-semibold text-[#004B93] underline"
              >
                Download recording
              </a>
            ) : (
              <audio
                controls
                preload="none"
                src={src}
                className="w-full"
                onError={() => setUnplayable((prev) => new Set(prev).add(row.id))}
              />
            )}

            {row.transcription_status === 'failed' && (
              <p className="text-[11px] text-amber-700 mt-2">
                Transcription failed — play the recording to hear the enquiry.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
