import { parseEmailSender, type ExtractedLeadFields } from './rawFirstLead.js'
import { findAuPhoneInText, phonesEqual } from './phone.js'
import { recordAiUsage } from './aiUsage.js'

export type { ExtractedLeadFields }

export type ExtractionContext = 'email' | 'voicemail' | 'sms'

export type ExtractionStatus = 'succeeded' | 'fallback' | 'failed'

export interface ExtractionRunResult {
  fields: ExtractedLeadFields
  status: ExtractionStatus
}

export interface ExtractionOptions {
  serviceTypes?: string[]
  aiContext?: string | null
  orgId?: string
}

function hasExtractedFields(fields: ExtractedLeadFields): boolean {
  return Object.keys(
    Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    )
  ).length > 0
}

const CLAUDE_MODEL = 'claude-sonnet-4-6'

export async function loadOrgExtractionContext(
  supabase: unknown,
  orgId: string
): Promise<ExtractionOptions> {
  if (!supabase || !orgId) return { serviceTypes: [], aiContext: null, orgId }
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => PromiseLike<{ data: { service_types?: unknown; ai_context?: unknown } | null }>
        }
      }
    }
  }
  const { data } = await client
    .from('orgs')
    .select('service_types, ai_context')
    .eq('id', orgId)
    .maybeSingle()
  const serviceTypes = Array.isArray(data?.service_types)
    ? data.service_types.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    : []
  return {
    serviceTypes,
    aiContext: typeof data?.ai_context === 'string' ? data.ai_context : null,
    orgId,
  }
}

const SERVICE_KEYWORD_MAP: Array<{ needles: string[]; label: string }> = [
  { needles: ['starlink'], label: 'Starlink' },
  { needles: ['video wall'], label: 'Video Wall' },
  { needles: ['wall mount', 'wall-mount', 'hanging the tv', 'mount the tv'], label: 'Wall Mounting' },
  { needles: ['home theatre', 'home theater', 'home cinema', 'media room'], label: 'Home Theatre' },
  { needles: ['sound bar', 'soundbar'], label: 'Sound Bar' },
  { needles: ['tv point', 'extra point', 'tv outlet'], label: 'TV Points' },
  { needles: ['reception', 'pixelat', 'pixilat', 'no signal', 'missing channel'], label: 'Reception Repair' },
  { needles: ['matv'], label: 'MATV' },
  { needles: ['cctv'], label: 'CCTV' },
  { needles: ['vast'], label: 'VAST TV' },
  { needles: ['satellite', 'foxtel'], label: 'Satellite Dish' },
  { needles: ['blocked drain', 'blocked drains'], label: 'Blocked Drain' },
  { needles: ['plumb'], label: 'Plumbing' },
  { needles: ['aerial', 'antenna'], label: 'TV Aerial' },
  { needles: ['electrical', 'electrician'], label: 'Electrical' },
  { needles: ['automation'], label: 'Home Automation' },
  { needles: ['remote'], label: 'Universal Remotes' },
]

function normalizeServiceTypes(serviceTypes?: string[] | null): string[] {
  return (serviceTypes ?? []).map((value) => value.trim()).filter(Boolean)
}

function formatServiceTypeList(serviceTypes: string[], fallback: string): string {
  const allowed = normalizeServiceTypes(serviceTypes)
  if (allowed.length === 0) return `"${fallback}"`
  return allowed.map((value) => `"${value}"`).join(', ')
}

/** Match enquiry text to an org's service list. Empty list → generic fallback, never a hardcoded trade. */
export function inferServiceType(
  text: string,
  serviceTypes?: string[] | null,
  fallback = 'Other'
): string {
  const combined = text.toLowerCase()
  const allowed = normalizeServiceTypes(serviceTypes)

  for (const { needles, label } of SERVICE_KEYWORD_MAP) {
    if (!needles.some((needle) => combined.includes(needle))) continue
    if (allowed.length === 0) continue
    const exact = allowed.find((value) => value.toLowerCase() === label.toLowerCase())
    if (exact) return exact
    const fuzzy = allowed.find((value) =>
      needles.some((needle) => value.toLowerCase().includes(needle))
    )
    if (fuzzy) return fuzzy
  }

  for (const label of allowed) {
    if (combined.includes(label.toLowerCase())) return label
  }

  if (allowed.includes('General Enquiry')) return 'General Enquiry'
  if (allowed.includes('Other')) return 'Other'
  return fallback
}

/** Prefer a phone found in the SMS body over the Twilio From (often a form-to-SMS gateway). */
function resolveSmsPhone(
  candidate: string | undefined | null,
  sourceText: string,
  fromNumber: string
): string {
  const bodyPhone = findAuPhoneInText(sourceText)
  const trimmed = candidate?.trim() || ''

  if (trimmed && bodyPhone) {
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
  context: ExtractionContext,
  opts?: ExtractionOptions
): string {
  const serviceList = formatServiceTypeList(opts?.serviceTypes ?? [], 'Other')
  const extra = opts?.aiContext?.trim() ? `\nBusiness context:\n${opts.aiContext.trim().slice(0, 1500)}\n` : ''

  if (context === 'sms') {
    return `Extract customer details from this SMS. Return ONLY valid JSON.
SMS:
${sourceText.substring(0, 1500)}
${extra}
Fields:
- customer_name (string)
- phone (string) – extract any phone number written in the SMS text (e.g. Contact Phone, Mobile, or bare AU numbers like 04xx xxx xxx / +614…). Do NOT use the SMS sender/From number (${from}) unless no phone digits appear anywhere in the text. Ignore footer lines like "Sent from my iPhone".
- email (string or empty)
- service_type (one of: ${serviceList})
- job_details (string, summary)
- address (string, combine Address, Suburb, State, Postcode)

Return: {"customer_name":"...","phone":"...","email":"...","service_type":"...","job_details":"...","address":"..."}`
  }

  if (context === 'voicemail') {
    return `This is an automated transcript of a voicemail left by a customer who called and missed reaching anyone. The transcript may contain transcription errors — use your best judgement. Return ONLY a JSON object, no markdown, no code fences.
${extra}
Fields:
- name: full name (or null)
- phone: phone number if mentioned in the transcript (or null)
- email: email address if mentioned (or null)
- service_type: one of ${serviceList}
- details: brief summary of what they need (1-2 sentences)
- address: street address if mentioned (or null)

Voicemail transcript: ${sourceText}`
  }

  return `Extract lead information from this email and return ONLY a JSON object, no markdown, no code fences.
${extra}
Fields:
- name: full name (or null)
- phone: phone number (or null)
- email: email address
- service_type: one of ${serviceList}
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
  context: ExtractionContext,
  opts?: ExtractionOptions
): Promise<ExtractedLeadFields | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    console.error('Claude extraction skipped: missing ANTHROPIC_API_KEY')
    if (context === 'sms') return null
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const prompt = buildClaudePrompt(sourceText, subject, from, context, opts)

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

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const totalTokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
  if (opts?.orgId && totalTokens > 0) {
    void recordAiUsage(opts.orgId, totalTokens)
  }

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
export function smsFallbackParse(
  smsText: string,
  fromNumber: string,
  opts?: ExtractionOptions
): ExtractedLeadFields {
  const result: ExtractedLeadFields = {
    name: 'SMS Enquiry',
    phone: resolveSmsPhone(undefined, smsText, fromNumber),
    email: undefined,
    service_type: inferServiceType(smsText, opts?.serviceTypes, 'Other'),
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
  if (fullText) {
    result.service_type = inferServiceType(fullText, opts?.serviceTypes, 'Other')
    result.details = fullText
  }
  return result
}

/** Regex fallback when Claude email extraction fails. */
export function emailFallbackParse(
  emailText: string,
  subject: string,
  from: string,
  opts?: ExtractionOptions
): ExtractedLeadFields {
  const { name, email } = parseEmailSender(from)
  const combined = `${subject} ${emailText}`
  const phoneMatch = emailText.match(/(?:phone|mobile|tel|contact)[:\s]*([+\d\s()-]{8,})/i)
  const addressMatch = emailText.match(/(?:address)[:\s]*(.+?)(?:\n|$)/i)
  const bodySnippet = emailText.replace(/\s+/g, ' ').trim().slice(0, 300)

  return {
    name,
    email,
    phone: phoneMatch?.[1]?.trim() ?? findAuPhoneInText(emailText) ?? null,
    service_type: inferServiceType(combined, opts?.serviceTypes, 'General Enquiry'),
    details: bodySnippet || subject || 'Inbound email enquiry',
    address: addressMatch?.[1]?.trim() ?? null,
  }
}

/** Claude with SMS regex fallback. */
export async function extractFromSms(
  smsText: string,
  fromNumber: string,
  opts?: ExtractionOptions
): Promise<ExtractionRunResult> {
  const extracted = await extractLeadWithClaude(smsText, '', fromNumber, 'sms', opts)
  if (extracted) {
    return { fields: extracted, status: 'succeeded' }
  }
  console.log('Claude SMS extraction failed, using fallback')
  return { fields: smsFallbackParse(smsText, fromNumber, opts), status: 'fallback' }
}

/** Claude with email regex fallback. */
export async function extractFromEmail(
  emailText: string,
  subject: string,
  from: string,
  opts?: ExtractionOptions
): Promise<ExtractionRunResult> {
  try {
    const extracted = await extractLeadWithClaude(emailText, subject, from, 'email', opts)
    if (extracted) {
      return { fields: extracted, status: 'succeeded' }
    }
  } catch (claudeErr) {
    console.error('Claude email extraction failed:', claudeErr)
  }
  return { fields: emailFallbackParse(emailText, subject, from, opts), status: 'fallback' }
}

/** Claude extraction for voicemail transcripts; empty fields → failed. */
export async function extractFromVoicemailTranscript(
  transcript: string,
  subject: string,
  from: string,
  opts?: ExtractionOptions
): Promise<ExtractionRunResult> {
  try {
    const extracted = await extractLeadWithClaude(transcript, subject, from, 'voicemail', opts)
    if (extracted && hasExtractedFields(extracted)) {
      return { fields: extracted, status: 'succeeded' }
    }
  } catch (claudeErr) {
    console.error('Claude voicemail extraction failed:', claudeErr)
  }
  return { fields: {}, status: 'failed' }
}
