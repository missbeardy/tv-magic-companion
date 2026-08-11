/**
 * Server-owned prompts for /api/anthropic callers (EmailParser paste-parse).
 * dd5: the client used to send a full `messages` array and the server forwarded it
 * verbatim — any authenticated session could send an arbitrary prompt to Claude on
 * the platform's API key. These builders take only structured, purpose-specific
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

/** Strips markdown code fences and extracts the outermost {...} — matches api/_lib/extractLead.ts. */
export function extractJsonObject(raw: string): string {
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) return cleaned
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1)
  return cleaned
}
