import type { SupabaseClient } from '@supabase/supabase-js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import {
  buildQuoteLink,
  firstName,
  followUpTemplateKey,
  formatJobService,
  resolveFollowUpStage,
  type FollowUpStage,
} from './quoteChasePolicy.js'
import { QUOTE_CHASE_SMS_FALLBACKS, buildQuoteChaseEmail } from './quoteChaseTemplates.js'
import { sendBrandedSms } from './sendBrandedSms.js'
import { sendTransactionalEmail } from './sendTransactionalEmail.js'
import { formatAuPhoneForSms } from './phone.js'
import { startWorkflowRun } from './workflowRun.js'

export interface QuoteChaseSweepResult {
  orgs: number
  checked: number
  sent: number
}

interface QuoteCandidate {
  id: string
  org_id: string
  lead_id: string
  status: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  service_type: string | null
  public_token: string
  token_expires_at: string
  sent_at: string
  follow_up_count: number
  last_followed_up_at: string | null
  follow_up_paused: boolean
  leads: { phone: string | null } | { phone: string | null }[] | null
}

function leadPhone(row: QuoteCandidate): string | null {
  const lead = row.leads
  if (!lead) return null
  const phone = Array.isArray(lead) ? lead[0]?.phone : lead.phone
  return phone?.trim() || null
}

function resolvePhone(row: QuoteCandidate): string | null {
  return row.customer_phone?.trim() || leadPhone(row)
}

function isTokenExpired(tokenExpiresAt: string | null, now: Date): boolean {
  if (!tokenExpiresAt) return false
  return new Date(tokenExpiresAt).getTime() < now.getTime()
}

async function findEnabledOrgIds(supabase: SupabaseClient): Promise<string[]> {
  const { data: orgRows, error } = await supabase
    .from('orgs')
    .select('id')
    .in('subscription_tier', ['pro', 'enterprise'])

  if (error || !orgRows?.length) return []

  const checks = await Promise.all(
    orgRows.map(async (row) => ({
      id: row.id as string,
      enabled: await isFeatureEnabledForOrg(row.id, 'quote_chase'),
    }))
  )
  return checks.filter((c) => c.enabled).map((c) => c.id)
}

export async function runQuoteChaseSweep(
  supabase: SupabaseClient
): Promise<QuoteChaseSweepResult> {
  const enabledOrgIds = await findEnabledOrgIds(supabase)
  const result: QuoteChaseSweepResult = {
    orgs: enabledOrgIds.length,
    checked: 0,
    sent: 0,
  }

  if (!enabledOrgIds.length) {
    console.log('[QUOTE_CHASE_SWEEP]', JSON.stringify(result))
    return result
  }

  const { data: rows, error } = await supabase
    .from('quotes')
    .select(
      'id, org_id, lead_id, status, customer_name, customer_email, customer_phone, service_type, public_token, token_expires_at, sent_at, follow_up_count, last_followed_up_at, follow_up_paused, leads(phone)'
    )
    .eq('status', 'sent')
    .eq('follow_up_paused', false)
    .lt('follow_up_count', 2)
    .not('sent_at', 'is', null)
    .in('org_id', enabledOrgIds)

  if (error) {
    console.error('[QUOTE_CHASE_SWEEP_FAILED] query error:', error.message)
    console.log('[QUOTE_CHASE_SWEEP]', JSON.stringify(result))
    return result
  }

  const now = new Date()

  for (const row of (rows ?? []) as QuoteCandidate[]) {
    const sentAt = new Date(row.sent_at)
    const lastFollowedUp = row.last_followed_up_at ? new Date(row.last_followed_up_at) : null
    const stage = resolveFollowUpStage(row.follow_up_count, sentAt, lastFollowedUp, now)
    if (!stage) continue

    result.checked += 1
    const didSend = await runQuoteChaseForQuote(supabase, row, stage, now)
    if (didSend) result.sent += 1
  }

  console.log('[QUOTE_CHASE_SWEEP]', JSON.stringify(result))
  return result
}

export async function runQuoteChaseForQuote(
  supabase: SupabaseClient,
  candidate: QuoteCandidate,
  stage: FollowUpStage,
  now: Date
): Promise<boolean> {
  const recorder = await startWorkflowRun(supabase, {
    workflowKey: 'quote_chase',
    orgId: candidate.org_id,
    triggerSummary: { quote_id: candidate.id, stage },
  })

  let sent = false
  let previousFollowUpCount = candidate.follow_up_count

  try {
    const { data: quote, error: loadError } = await supabase
      .from('quotes')
      .select(
        'id, org_id, lead_id, status, customer_name, customer_email, customer_phone, service_type, public_token, token_expires_at, sent_at, follow_up_count, last_followed_up_at, follow_up_paused, leads(phone)'
      )
      .eq('id', candidate.id)
      .eq('org_id', candidate.org_id)
      .maybeSingle()

    if (loadError || !quote) {
      await recorder.step('load_quote', 'failed', { error: loadError ?? 'Not found' })
      await recorder.finish('failed')
      return false
    }

    const loaded = quote as QuoteCandidate
    await recorder.step('load_quote', 'succeeded')

    previousFollowUpCount = loaded.follow_up_count

    const flagEnabled = await isFeatureEnabledForOrg(loaded.org_id, 'quote_chase')
    const sentAt = loaded.sent_at ? new Date(loaded.sent_at) : null
    const lastFollowedUp = loaded.last_followed_up_at
      ? new Date(loaded.last_followed_up_at)
      : null
    const currentStage = sentAt
      ? resolveFollowUpStage(loaded.follow_up_count, sentAt, lastFollowedUp, now)
      : null

    const phone = resolvePhone(loaded)
    const email = loaded.customer_email?.trim() || null
    const hasContact = Boolean(phone || email)
    const tokenExpired = isTokenExpired(loaded.token_expires_at, now)

    if (
      !flagEnabled ||
      loaded.follow_up_paused ||
      loaded.status !== 'sent' ||
      !sentAt ||
      tokenExpired ||
      currentStage !== stage ||
      !hasContact
    ) {
      await recorder.step('policy_check', 'skipped')
      await recorder.finish('succeeded')
      return false
    }

    await recorder.step('policy_check', 'succeeded')

    const { data: org } = await supabase
      .from('orgs')
      .select('name')
      .eq('id', loaded.org_id)
      .single()

    const messageVars = {
      firstName: firstName(loaded.customer_name),
      jobService: formatJobService(loaded.service_type),
      link: buildQuoteLink(loaded.public_token),
      'org.name': org?.name?.trim() || 'Your organisation',
    }

    let channel: 'sms' | 'email' | null = null

    if (phone) {
      const smsResult = await sendBrandedSms({
        orgId: loaded.org_id,
        toPhone: formatAuPhoneForSms(phone),
        templateKey: followUpTemplateKey(stage),
        vars: messageVars,
        fallbackMessage: QUOTE_CHASE_SMS_FALLBACKS[stage],
        leadId: loaded.lead_id,
        eventType: 'sms_sent',
        eventNote: `Quote follow-up (stage ${stage})`,
        eventPayload: { quote_id: loaded.id, stage },
      })

      if (!smsResult.sent) {
        await recorder.step('send_follow_up', 'failed', {
          error: smsResult.error ?? smsResult.skipped ?? 'SMS not sent',
          output: { channel: 'sms', stage },
        })
        await recorder.finish('failed')
        return false
      }
      channel = 'sms'
      sent = true
    } else if (email) {
      const { subject, html } = buildQuoteChaseEmail(stage, messageVars)
      const emailResult = await sendTransactionalEmail({ to: email, subject, html })
      if (!emailResult.sent) {
        await recorder.step('send_follow_up', 'failed', {
          error: emailResult.message,
          output: { channel: 'email', stage },
        })
        await recorder.finish('failed')
        return false
      }
      channel = 'email'
      sent = true
    }

    await recorder.step('send_follow_up', 'succeeded', { output: { channel, stage } })

    const followedUpAt = new Date().toISOString()
    const { data: updated, error: recordError } = await supabase
      .from('quotes')
      .update({
        follow_up_count: previousFollowUpCount + 1,
        last_followed_up_at: followedUpAt,
        updated_at: followedUpAt,
      })
      .eq('id', loaded.id)
      .eq('org_id', loaded.org_id)
      .eq('follow_up_count', previousFollowUpCount)
      .select('id')
      .maybeSingle()

    if (recordError || !updated) {
      console.error('[QUOTE_FOLLOW_UP_RECORD_FAILED]', { quote_id: loaded.id })
      await recorder.step('record_follow_up', 'failed', {
        error: recordError ?? 'Optimistic update failed',
      })
      await recorder.finish('partial')
      return sent
    }

    await recorder.step('record_follow_up', 'succeeded')
    await recorder.finish('succeeded')
    return sent
  } catch (err) {
    console.error('[QUOTE_CHASE_RUN_FAILED]', { quote_id: candidate.id, err })
    await recorder.finish('failed')
    return sent
  }
}
