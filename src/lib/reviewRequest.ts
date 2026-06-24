import { supabase } from './supabase'
import { getAuthHeaders } from './apiAuth'

export interface ReviewRequestOrg {
  name: string
  google_review_url?: string | null
  review_requests_enabled?: boolean | null
}

export interface ReviewRequestLead {
  id: string
  name: string
  phone: string | null | undefined
  review_request_sent_at?: string | null
}

export function canOfferReviewRequest(
  org: ReviewRequestOrg | null | undefined,
  lead: ReviewRequestLead
): boolean {
  if (org?.review_requests_enabled === false) return false
  if (!org?.google_review_url?.trim()) return false
  if (!lead.phone?.trim()) return false
  if (lead.review_request_sent_at) return false
  return true
}

/** After a job is marked complete — confirm with tech, then send review SMS if accepted. */
export async function promptAndSendReviewRequest(
  org: ReviewRequestOrg | null | undefined,
  lead: ReviewRequestLead,
  logEvent?: (leadId: string, note: string) => Promise<void>
): Promise<'sent' | 'declined' | 'skipped'> {
  if (!canOfferReviewRequest(org, lead)) return 'skipped'

  const confirmed = window.confirm(
    `Send a Google review request to ${lead.name} at ${lead.phone}?\n\n` +
      `Turn off review prompts anytime in Franchise Settings.`
  )
  if (!confirmed) return 'declined'

  try {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/send-sms', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'review_request',
        to: lead.phone!.trim(),
        customerName: lead.name,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`Review request SMS failed: ${(data as { error?: string }).error ?? res.statusText}`)
      return 'skipped'
    }

    const sentAt = new Date().toISOString()
    await supabase
      .from('leads')
      .update({ review_request_sent_at: sentAt })
      .eq('id', lead.id)

    await logEvent?.(lead.id, 'Google review request SMS sent')

    return 'sent'
  } catch (err) {
    console.error('Review request SMS failed:', err)
    alert('Could not send review request SMS. Check your connection and try again.')
    return 'skipped'
  }
}
