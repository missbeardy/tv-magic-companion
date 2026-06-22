export interface LeadDisplayFields {
  details?: string | null
  raw_email?: string | null
}

/** Returns the AI-extracted summary, stripping embedded voicemail transcripts when raw source is stored separately. */
export function getLeadDisplayDetails(lead: LeadDisplayFields): string | null {
  if (!lead.details?.trim()) return null
  if (lead.raw_email && lead.details.includes('\n\nFull transcript:')) {
    const summary = lead.details.split('\n\nFull transcript:')[0].trim()
    return summary || null
  }
  return lead.details.trim()
}
