import { supabase } from './supabase'
import { getAuthHeaders } from './apiAuth'
import { formatAuPhoneForSms } from './phone'

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

export function getReviewRequestBlockReason(
  org: ReviewRequestOrg | null | undefined,
  lead: ReviewRequestLead,
  reviewFeatureEnabled = true
): string | null {
  if (!reviewFeatureEnabled) {
    return 'Review requests are disabled for this brand. Contact your platform admin.'
  }
  if (!org?.google_review_url?.trim()) {
    return 'Add a Google Review Link in Franchise Settings and tap Save.'
  }
  if (!lead.phone?.trim()) {
    return 'This lead has no phone number.'
  }
  if (lead.review_request_sent_at) {
    return 'A review request was already sent for this job.'
  }
  return null
}

export function canOfferReviewRequest(
  org: ReviewRequestOrg | null | undefined,
  lead: ReviewRequestLead,
  reviewFeatureEnabled = true
): boolean {
  if (!reviewFeatureEnabled) return false
  if (!org?.google_review_url?.trim()) return false
  if (!lead.phone?.trim()) return false
  if (lead.review_request_sent_at) return false
  return true
}

export async function fetchReviewOrg(orgId: string): Promise<ReviewRequestOrg | null> {
  const { data, error } = await supabase
    .from('orgs')
    .select('name, google_review_url, review_requests_enabled')
    .eq('id', orgId)
    .single()

  if (error) {
    console.error('Failed to load review settings:', error)
    return null
  }
  return data as ReviewRequestOrg
}

export async function isReviewRequestEligible(
  org: ReviewRequestOrg | null | undefined,
  lead: ReviewRequestLead,
  orgId?: string | null,
  reviewFeatureEnabled = true
): Promise<boolean> {
  const activeOrg = orgId ? (await fetchReviewOrg(orgId)) ?? org : org
  return canOfferReviewRequest(activeOrg, lead, reviewFeatureEnabled)
}

/** Send review-request SMS (no UI — caller handles prompts). */
export async function sendReviewRequestSms(
  lead: ReviewRequestLead,
  logEvent?: (leadId: string, note: string) => Promise<void>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders()
    if (!headers.Authorization) {
      return { ok: false, error: 'Session expired — log out and sign in again.' }
    }

    const res = await fetch('/api/send-sms', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'review_request',
        leadId: lead.id,
        to: formatAuPhoneForSms(lead.phone!.trim()),
        customerName: lead.name,
      }),
    })

    const data = await res.json().catch(() => ({})) as { error?: string; detail?: string }

    if (!res.ok) {
      const detail = data.detail ? ` (${data.detail})` : ''
      return { ok: false, error: `${data.error ?? res.statusText}${detail}` }
    }

    const sentAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('leads')
      .update({ review_request_sent_at: sentAt })
      .eq('id', lead.id)

    if (updateError) {
      console.error('review_request_sent_at update failed:', updateError)
    }

    await logEvent?.(lead.id, 'Google review request SMS sent')
    return { ok: true }
  } catch (err) {
    console.error('Review request SMS failed:', err)
    return { ok: false, error: 'Could not send the text. Check your connection and try again.' }
  }
}
