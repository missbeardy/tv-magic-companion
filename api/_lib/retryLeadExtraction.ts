import type { SupabaseClient } from '@supabase/supabase-js'
import {
  extractFromEmail,
  extractFromSms,
  extractFromVoicemailTranscript,
  type ExtractionRunResult,
} from './extractLead.js'
import {
  extractFacebookLeadWithClaude,
  facebookLeadFallbackParse,
} from './handleInboundFacebookLead.js'
import { formatAuPhoneForSms } from './phone.js'
import { setLeadExtractionStatus } from './processInboundLead.js'
import {
  pickExtractedFields,
  updateLeadFromExtraction,
  type ExtractedLeadFields,
} from './rawFirstLead.js'

export interface LeadExtractionRetryInput {
  id: string
  org_id: string
  source: string | null
  name: string | null
  phone?: string | null
  email?: string | null
  raw_sms: string | null
  raw_email: string | null
  extraction_status?: string | null
}

function parseSmsRaw(rawSms: string): { body: string; from: string } {
  try {
    const parsed = JSON.parse(rawSms) as { Body?: string; From?: string }
    return {
      body: typeof parsed.Body === 'string' ? parsed.Body : rawSms,
      from: typeof parsed.From === 'string' ? parsed.From : '',
    }
  } catch {
    return { body: rawSms, from: '' }
  }
}

function parseFacebookRaw(rawEmail: string): {
  name: string
  phone: string
  message: string
  email: string | null
  city: string | null
} | null {
  try {
    const parsed = JSON.parse(rawEmail) as Record<string, unknown>
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
    const phone = typeof parsed.phone === 'string' ? parsed.phone.trim() : ''
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : ''
    if (!name || !phone) return null
    return {
      name,
      phone,
      message,
      email: typeof parsed.email === 'string' ? parsed.email.trim() || null : null,
      city: typeof parsed.city === 'string' ? parsed.city.trim() || null : null,
    }
  } catch {
    return null
  }
}

/** Re-run extraction from stored raw_sms / raw_email based on lead source. */
export async function runLeadExtractionRetry(
  lead: LeadExtractionRetryInput
): Promise<ExtractionRunResult> {
  const source = lead.source ?? ''

  if (source === 'sms' && lead.raw_sms) {
    const { body, from } = parseSmsRaw(lead.raw_sms)
    const fromNumber = from || lead.phone || ''
    return extractFromSms(body, fromNumber)
  }

  if (source === 'email' && lead.raw_email) {
    return extractFromEmail(lead.raw_email, 'Inbound email', lead.email || 'Unknown Sender')
  }

  if (source === 'phone' && lead.raw_email) {
    return extractFromVoicemailTranscript(
      lead.raw_email,
      'Voicemail',
      lead.phone || 'Unknown'
    )
  }

  if (source === 'facebook_messenger' && lead.raw_email) {
    const fb = parseFacebookRaw(lead.raw_email)
    if (!fb) {
      return { fields: {}, status: 'failed' }
    }
    const normalizedPhone = formatAuPhoneForSms(fb.phone)
    const claude = await extractFacebookLeadWithClaude(
      fb.name,
      normalizedPhone,
      fb.message,
      fb.email
    )
    if (claude) {
      return { fields: claude, status: 'succeeded' }
    }
    return {
      fields: facebookLeadFallbackParse(
        fb.name,
        normalizedPhone,
        fb.message,
        fb.email,
        fb.city
      ),
      status: 'fallback',
    }
  }

  return { fields: {}, status: 'failed' }
}

/** True when a voicemail transcript can replace placeholder missed-call fields. */
export function canEnrichLeadFromVoicemail(lead: {
  extraction_status?: string | null
  name?: string | null
}): boolean {
  const status = lead.extraction_status
  if (status === 'pending' || status === 'failed' || status === 'fallback') return true
  return (lead.name || '').trim() === 'Missed Call'
}

/** Enrich an existing missed-call lead from a voicemail transcript. */
export async function enrichLeadFromVoicemailTranscript(
  supabase: SupabaseClient,
  lead: LeadExtractionRetryInput,
  transcript: string,
  opts?: {
    subject?: string
    from?: string
    actorId?: string
    callInfo?: string
  }
): Promise<ExtractionRunResult> {
  const subject = opts?.subject ?? 'Voicemail'
  const from = opts?.from ?? lead.phone ?? 'Unknown'
  const runResult = await extractFromVoicemailTranscript(transcript, subject, from)

  const callInfo = opts?.callInfo ?? ''
  const details = runResult.fields.details
    ? `${runResult.fields.details}\n\nFull transcript: ${transcript}\n\n${callInfo}`
    : transcript.trim()
      ? `Voicemail transcript: ${transcript}\n\n${callInfo}`
      : `Missed call voicemail received. ${callInfo}`

  const updateFields: ExtractedLeadFields = {
    name: runResult.fields.name || lead.name || 'Missed Call',
    phone: runResult.fields.phone || lead.phone,
    email: runResult.fields.email,
    service_type: runResult.fields.service_type || 'General Enquiry',
    details,
    address: runResult.fields.address,
  }

  await updateLeadFromExtraction(supabase, lead.id, updateFields)
  await setLeadExtractionStatus(supabase, lead.id, runResult.status)
  await supabase.from('leads').update({ raw_email: transcript }).eq('id', lead.id)

  const { error: eventError } = await supabase.from('lead_events').insert({
    lead_id: lead.id,
    org_id: lead.org_id,
    event_type: 'voicemail_enriched',
    note: 'Lead enriched from voicemail transcript',
    created_by: opts?.actorId ?? null,
    payload: { extraction_status: runResult.status },
  })
  if (eventError) {
    console.error('voicemail_enriched event failed:', eventError.message)
  }

  return { fields: pickExtractedFields(updateFields), status: runResult.status }
}

/** Retry extraction, apply fields, update status, and log extraction_retried. */
export async function applyLeadExtractionRetry(
  supabase: SupabaseClient,
  lead: LeadExtractionRetryInput,
  actorId?: string
): Promise<ExtractionRunResult> {
  const result = await runLeadExtractionRetry(lead)
  await updateLeadFromExtraction(supabase, lead.id, result.fields)
  await setLeadExtractionStatus(supabase, lead.id, result.status)

  const { error: eventError } = await supabase.from('lead_events').insert({
    lead_id: lead.id,
    org_id: lead.org_id,
    event_type: 'extraction_retried',
    note: `Extraction retry (${result.status})`,
    created_by: actorId ?? null,
    payload: { extraction_status: result.status, source: lead.source },
  })
  if (eventError) {
    console.error('extraction_retried event failed:', eventError.message)
  }

  return result
}
