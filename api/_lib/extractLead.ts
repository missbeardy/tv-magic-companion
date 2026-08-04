import { parseEmailSender, type ExtractedLeadFields } from './rawFirstLead.js'
import { findAuPhoneInText, phonesEqual } from './phone.js'

export type { ExtractedLeadFields }

export type ExtractionContext = 'email' | 'voicemail' | 'sms'

export type ExtractionStatus = 'succeeded' | 'fallback' | 'failed'

export interface ExtractionRunResult {
  fields: ExtractedLeadFields
  status: ExtractionStatus
}

function hasExtractedFields(fields: ExtractedLeadFields): boolean {
  return Object.keys(
    Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    )
  ).length > 0
}

const CLAUDE_MODEL = 'claude-sonnet-4-6'

/** Prefer a phone found in the SMS body over the Twilio From (often a form-to-SMS gateway). */
function resolveSmsPhone(
  candidate: string | undefined | null,
  sourceText: string,
  fromNumber: string
): string {
  const bodyPhone = findAuPhoneInText(sourceText)
  const trimmed = candidate?.trim() || ''

  if (trimmed && bodyPhone) {
    // Claude/label returned the gateway From — prefer the number in the text.
    if (fromNumber && phonesEqual(trimmed, fromNumber) && !phonesEqual(bodyPhone, fromNumber)) {
      return bodyPhone
    }
    return trimmed
  }
  if (trimmed) return trimmed
  if (bodyPhone) return bodyPhone
  return fromNumber
}

function extractJsonObject(raw: string): string {
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) return cleaned
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1)
  return cleaned
}

function buildClaudePrompt(
  sourceText: string,
  subject: string,
  from: string,
  context: ExtractionContext
): string {
  if (context === 'sms') {
    return `Extract customer details from this SMS. Return ONLY valid JSON.
SMS:
${sourceText.substring(0, 1500)}

Fields:
- customer_name (string)
- phone (string) – extract any phone number written in the SMS text (e.g. Contact Phone, Mobile, or bare AU numbers like 04xx xxx xxx / +614…). Do NOT use the SMS sender/From number (${from}) unless no phone digits appear anywhere in the text. Ignore footer lines like "Sent from my iPhone".
- email (string or empty)
- service_type (one of: "TV Aerial","Satellite Dish","CCTV","Home Automation","Other")
- job_details (string, summary)
- address (string, combine Address, Suburb, State, Postcode)

Return: {"customer_name":"...","phone":"...","email":"...","service_type":"...","job_details":"...","address":"..."}`
  }

  if (context === 'voicemail') {
    return `This is an automated transcript of a voicemail left by a customer who called a TV aerial/satellite installation business and missed reaching anyone. The transcript may contain transcription errors — use your best judgement. Return ONLY a JSON object, no markdown, no code fences.

Fields:
- name: full name (or null)
- phone: phone number if mentioned in the transcript (or null)
- email: email address if mentioned (or null)
- service_type: type of service requested (e.g. "TV Aerial", "Satellite", "MATV", "General Enquiry")
- details: brief summary of what they need (1-2 sentences)
- address: street address if mentioned (or null)

Voicemail transcript: ${sourceText}`
  }

  return `Extract lead information from this email and return ONLY a JSON object, no markdown, no code fences.

Fields:
- name: full name (or null)
- phone: phone number (or null)
- email: email address
- service_type: type of service requested (e.g. "TV Aerial", "Satellite", "MATV", "General Enquiry")
- details: brief summary of their request (1-2 sentences)
- address: street address if mentioned (or null)

Email From: ${from}
Subject: ${subject}
Body: ${sourceText}`
}

interface ClaudeSmsPayload {
  customer_name?: string
  phone?: string
  email?: string
  service_type?: string
  job_details?: string
  address?: string
}

interface ClaudeStandardPayload {
  name?: string | null
  phone?: string | null
  email?: string | null
  service_type?: string | null
  details?: string | null
  address?: string | null
}

function mapSmsClaudePayload(
  parsed: ClaudeSmsPayload,
  fromNumber: string,
  sourceText: string
): ExtractedLeadFields {
  return {
    name: parsed.customer_name?.trim() || undefined,
    phone: resolveSmsPhone(parsed.phone, sourceText, fromNumber),
    email: parsed.email?.trim() || undefined,
    service_type: parsed.service_type || 'Other',
    details: parsed.job_details?.trim() || undefined,
    address: parsed.address?.trim() || undefined,
  }
}

function mapStandardClaudePayload(parsed: ClaudeStandardPayload): ExtractedLeadFields {
  return {
    name: parsed.name?.trim() || undefined,
    phone: parsed.phone?.trim() || undefined,
    email: parsed.email?.trim() || undefined,
    service_type: parsed.service_type?.trim() || undefined,
    details: parsed.details?.trim() || undefined,
    address: parsed.address?.trim() || undefined,
  }
}

/** Call Claude for structured lead fields. Throws on API/parse errors (email/voicemail). Returns null for SMS when key missing or call fails. */
export async function extractLeadWithClaude(
  sourceText: string,
  subject: string,
  from: string,
  context: ExtractionContext
): Promise<ExtractedLeadFields | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    console.error('Claude extraction skipped: missing ANTHROPIC_API_KEY')
    if (context === 'sms') return null
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const prompt = buildClaudePrompt(sourceText, subject, from, context)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    console.error(
      `Claude ${context} extraction HTTP ${response.status}:`,
      errBody.slice(0, 500)
    )
    if (context === 'sms') return null
    throw new Error(`Anthropic API error: ${response.status}`)
  }

  const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> }
  const raw = data.content?.[0]?.text || ''
  const cleaned = extractJsonObject(raw)

  try {
    const parsed = JSON.parse(cleaned) as ClaudeSmsPayload & ClaudeStandardPayload
    if (context === 'sms') {
      return mapSmsClaudePayload(parsed, from, sourceText)
    }
    return mapStandardClaudePayload(parsed)
  } catch (err) {
    if (context === 'sms') {
      console.error('Claude SMS parse error:', err, 'raw:', raw.slice(0, 300))
      return null
    }
    throw err
  }
}

/** Regex fallback when Claude SMS extraction fails. */
export function smsFallbackParse(smsText: string, fromNumber: string): ExtractedLeadFields {
  const result: ExtractedLeadFields = {
    name: 'SMS Enquiry',
    phone: resolveSmsPhone(undefined, smsText, fromNumber),
    email: undefined,
    service_type: 'Other',
    details: smsText.substring(0, 200),
    address: undefined,
  }

  const nameMatch = smsText.match(/Your Name:\s*(.+?)(?:\n|$)/i)
  if (nameMatch) result.name = nameMatch[1].trim()
  const phoneMatch = smsText.match(/Contact Phone:\s*(.+?)(?:\n|$)/i)
  if (phoneMatch) {
    result.phone = resolveSmsPhone(phoneMatch[1].trim(), smsText, fromNumber)
  }
  const emailMatch = smsText.match(/Your Email:\s*(.+?)(?:\n|$)/i)
  if (emailMatch) result.email = emailMatch[1].trim()
  const addressMatch = smsText.match(/Address:\s*(.+?)(?:\n|$)/i)
  const suburbMatch = smsText.match(/Suburb:\s*(.+?)(?:\n|$)/i)
  const stateMatch = smsText.match(/State:\s*(.+?)(?:\n|$)/i)
  const postcodeMatch = smsText.match(/Postcode:\s*(.+?)(?:\n|$)/i)
  const addrParts = [addressMatch?.[1], suburbMatch?.[1], stateMatch?.[1], postcodeMatch?.[1]].filter(Boolean)
  if (addrParts.length) result.address = addrParts.join(', ')
  const subjectMatch = smsText.match(/Subject:\s*(.+?)(?:\n|$)/i)
  const messageMatch = smsText.match(/Message:\s*(.+?)(?:\n|$)/is)
  const fullText = [subjectMatch?.[1], messageMatch?.[1]].filter(Boolean).join(' ')
  if (fullText.toLowerCase().includes('aerial') || fullText.toLowerCase().includes('antenna')) {
    result.service_type = 'TV Aerial'
  } else if (fullText.toLowerCase().includes('satellite')) {
    result.service_type = 'Satellite Dish'
  } else if (fullText.toLowerCase().includes('cctv')) {
    result.service_type = 'CCTV'
  }
  result.details = fullText || smsText.substring(0, 200)
  return result
}

/** Regex fallback when Claude email extraction fails. */
export function emailFallbackParse(
  emailText: string,
  subject: string,
  from: string
): ExtractedLeadFields {
  const { name, email } = parseEmailSender(from)
  const combined = `${subject} ${emailText}`.toLowerCase()

  let service_type = 'General Enquiry'
  if (combined.includes('aerial') || combined.includes('antenna')) service_type = 'TV Aerial'
  else if (combined.includes('satellite')) service_type = 'Satellite Dish'
  else if (combined.includes('cctv')) service_type = 'CCTV'

  const phoneMatch = emailText.match(/(?:phone|mobile|tel|contact)[:\s]*([+\d\s()-]{8,})/i)
  const addressMatch = emailText.match(/(?:address)[:\s]*(.+?)(?:\n|$)/i)
  const bodySnippet = emailText.replace(/\s+/g, ' ').trim().slice(0, 300)

  return {
    name,
    email,
    phone: phoneMatch?.[1]?.trim() ?? findAuPhoneInText(emailText) ?? null,
    service_type,
    details: bodySnippet || subject || 'Inbound email enquiry',
    address: addressMatch?.[1]?.trim() ?? null,
  }
}

/** Claude with SMS regex fallback. */
export async function extractFromSms(
  smsText: string,
  fromNumber: string
): Promise<ExtractionRunResult> {
  const extracted = await extractLeadWithClaude(smsText, '', fromNumber, 'sms')
  if (extracted) {
    return { fields: extracted, status: 'succeeded' }
  }
  console.log('Claude SMS extraction failed, using fallback')
  return { fields: smsFallbackParse(smsText, fromNumber), status: 'fallback' }
}

/** Claude with email regex fallback. */
export async function extractFromEmail(
  emailText: string,
  subject: string,
  from: string
): Promise<ExtractionRunResult> {
  try {
    const extracted = await extractLeadWithClaude(emailText, subject, from, 'email')
    if (extracted) {
      return { fields: extracted, status: 'succeeded' }
    }
  } catch (claudeErr) {
    console.error('Claude email extraction failed:', claudeErr)
  }
  return { fields: emailFallbackParse(emailText, subject, from), status: 'fallback' }
}

/** Claude extraction for voicemail transcripts; empty fields → failed. */
export async function extractFromVoicemailTranscript(
  transcript: string,
  subject: string,
  from: string
): Promise<ExtractionRunResult> {
  try {
    const extracted = await extractLeadWithClaude(transcript, subject, from, 'voicemail')
    if (extracted && hasExtractedFields(extracted)) {
      return { fields: extracted, status: 'succeeded' }
    }
  } catch (claudeErr) {
    console.error('Claude voicemail extraction failed:', claudeErr)
  }
  return { fields: {}, status: 'failed' }
}
