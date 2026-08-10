/**
 * Server-owned prompts for the two legitimate /api/anthropic callers (EmailParser.tsx's
 * paste-parse, generateCaption.ts). dd5: the client used to send a full `messages` array and
 * the server forwarded it verbatim — any authenticated session could send an arbitrary prompt
 * to Claude on the platform's API key. These builders take only structured, purpose-specific
 * input; the client can no longer influence anything except the data fields being filled in.
 */

export interface LeadExtractionPromptInput {
  rawText: string
}

const MAX_RAW_TEXT_LENGTH = 8000

export function buildLeadExtractionPrompt(input: LeadExtractionPromptInput): string {
  const rawText = input.rawText.trim().slice(0, MAX_RAW_TEXT_LENGTH)
  return `Extract the following fields from this email and respond ONLY with a JSON object, no markdown, no explanation:
{
  "name": "customer full name or empty string",
  "phone": "phone number or empty string",
  "email": "email address or empty string",
  "address": "full street address including suburb and postcode if present, or empty string",
  "service_type": "one of: TV Aerial, Satellite Dish, Home Automation, CCTV, General Repair, Other",
  "lead_source": "where the lead came from — one of: Website, Google, Facebook, Referral, Phone, Email, Unknown",
  "details": "brief summary of the job details or empty string"
}

Email:
${rawText}`
}

export interface CaptionPromptInput {
  jobContext: string
  notes: string
}

const MAX_CAPTION_FIELD_LENGTH = 2000

export function buildCaptionPrompt(input: CaptionPromptInput): string {
  const jobContext = input.jobContext.trim().slice(0, MAX_CAPTION_FIELD_LENGTH)
  const notes = input.notes.trim().slice(0, MAX_CAPTION_FIELD_LENGTH)
  return `You are a professional social media copywriter for a local Australian trade business.

Write a social media caption based on the technician's notes below. Rules:
- 2-3 sentences maximum
- Warm, professional, and slightly proud tone
- Inject exactly 2 relevant emojis naturally into the sentences (not at the end)
- End with exactly 4 relevant hashtags on a new line (trade + local + service, no brand-specific tags unless the job notes name the brand)

Job context: ${jobContext}
Technician's notes: ${notes}

Respond with ONLY the caption text, nothing else.`
}

/** Strips markdown code fences and extracts the outermost {...} — matches api/_lib/extractLead.ts. */
export function extractJsonObject(raw: string): string {
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) return cleaned
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1)
  return cleaned
}
