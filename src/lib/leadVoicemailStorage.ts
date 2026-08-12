import { supabase } from './supabase'

export const LEAD_VOICEMAILS_BUCKET = 'lead-voicemails'

/** Default TTL for in-app playback (1 hour), matching lead photos. */
export const LEAD_VOICEMAIL_DISPLAY_TTL = 3600

export interface LeadVoicemail {
  id: string
  storage_path: string | null
  duration_text: string | null
  received_text: string | null
  caller_phone: string | null
  file_name: string | null
  transcription_status: string
  created_at: string
}

export async function signLeadVoicemailPath(
  storagePath: string,
  expiresIn = LEAD_VOICEMAIL_DISPLAY_TTL,
): Promise<string | null> {
  if (!storagePath) return null

  const { data, error } = await supabase.storage
    .from(LEAD_VOICEMAILS_BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error || !data?.signedUrl) {
    console.warn('Failed to sign lead voicemail URL:', error?.message ?? storagePath)
    return null
  }

  return data.signedUrl
}

export async function fetchLeadVoicemails(leadId: string): Promise<LeadVoicemail[]> {
  const { data, error } = await supabase
    .from('lead_voicemails')
    .select('id, storage_path, duration_text, received_text, caller_phone, file_name, transcription_status, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('Failed to load lead voicemails:', error.message)
    return []
  }

  return data ?? []
}

/**
 * 3CX sends "00:00:26". Trim the leading zero hour so the UI reads "0:26"
 * rather than something that looks like a timestamp.
 */
export function formatVoicemailDuration(durationText: string | null): string | null {
  if (!durationText) return null
  const match = durationText.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!match) return durationText

  const [, hours, minutes, seconds] = match
  const h = Number(hours)
  const m = Number(minutes)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${seconds}`
  return `${m}:${seconds}`
}
