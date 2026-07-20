import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { sendBrandedSms } from './sendBrandedSms.js'

export interface AutoReviewGuardInput {
  autoReviewEnabled: boolean
  reviewRequestsEnabled: boolean
  googleReviewUrl: string | null | undefined
  reviewRequestSentAt: string | null | undefined
  phone: string | null | undefined
}

export type AutoReviewGuardResult =
  | { ok: true }
  | { ok: false; reason: string }

/** Pure guard for paid→review automation. Unit-tested. */
export function shouldAutoReviewOnPaid(input: AutoReviewGuardInput): AutoReviewGuardResult {
  if (!input.autoReviewEnabled) {
    return { ok: false, reason: 'auto_review_on_paid_disabled' }
  }
  if (!input.reviewRequestsEnabled) {
    return { ok: false, reason: 'review_requests_disabled' }
  }
  if (!input.googleReviewUrl?.trim()) {
    return { ok: false, reason: 'google_review_url_missing' }
  }
  if (input.reviewRequestSentAt) {
    return { ok: false, reason: 'already_sent' }
  }
  if (!input.phone?.trim()) {
    return { ok: false, reason: 'no_phone' }
  }
  return { ok: true }
}

export interface MaybeSendReviewOnPaidResult {
  sent: boolean
  skipped?: string
  error?: string
}

/**
 * Fire-and-forget safe: call after an invoice is newly marked paid.
 * Claims `review_request_sent_at` before sending so webhook retries never double-SMS.
 */
export async function maybeSendReviewOnInvoicePaid(
  orgId: string,
  leadId: string
): Promise<MaybeSendReviewOnPaidResult> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { sent: false, error: 'Server not configured' }
  }

  const [autoReviewEnabled, reviewRequestsEnabled] = await Promise.all([
    isFeatureEnabledForOrg(orgId, 'auto_review_on_paid'),
    isFeatureEnabledForOrg(orgId, 'review_requests'),
  ])

  const [{ data: lead }, { data: org }] = await Promise.all([
    supabase
      .from('leads')
      .select('id, name, phone, review_request_sent_at')
      .eq('id', leadId)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('orgs')
      .select('google_review_url')
      .eq('id', orgId)
      .maybeSingle(),
  ])

  if (!lead) {
    return { sent: false, skipped: 'lead_not_found' }
  }

  const guard = shouldAutoReviewOnPaid({
    autoReviewEnabled,
    reviewRequestsEnabled,
    googleReviewUrl: org?.google_review_url,
    reviewRequestSentAt: lead.review_request_sent_at,
    phone: lead.phone,
  })

  if (!guard.ok) {
    return { sent: false, skipped: guard.reason }
  }

  const reviewUrl = org!.google_review_url!.trim()
  const sentAt = new Date().toISOString()

  // Claim the send slot first (idempotent under concurrent webhook deliveries).
  const { data: claimed, error: claimError } = await supabase
    .from('leads')
    .update({ review_request_sent_at: sentAt })
    .eq('id', leadId)
    .eq('org_id', orgId)
    .is('review_request_sent_at', null)
    .select('id')
    .maybeSingle()

  if (claimError) {
    return { sent: false, error: claimError.message }
  }
  if (!claimed) {
    return { sent: false, skipped: 'already_sent' }
  }

  const smsResult = await sendBrandedSms({
    orgId,
    toPhone: lead.phone!,
    templateKey: 'customer_review_request',
    vars: {
      customerName: lead.name,
      reviewUrl,
    },
    fallbackMessage:
      `Hi {{customerName}}, thanks for choosing {{org.name}}! We'd love your feedback: {{reviewUrl}}`,
    leadId,
    eventType: 'review_request',
    eventNote: 'Google review request SMS sent (auto on paid)',
    eventPayload: { source: 'auto_review_on_paid' },
  })

  if (!smsResult.sent) {
    // Leave review_request_sent_at set to avoid double-SMS spam on retry;
    // ops can clear the column manually if a rare Twilio failure needs a resend.
    console.error('auto_review_on_paid SMS failed:', smsResult.error ?? smsResult.skipped)
    return {
      sent: false,
      error: smsResult.error ?? smsResult.skipped ?? 'sms_failed',
    }
  }

  return { sent: true }
}
