import type { SupabaseClient } from '@supabase/supabase-js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import {
  chaseTemplateKey,
  daysOverdue,
  deriveDueAt,
  firstName,
  formatDueDateEnAu,
  formatInvoiceAmount,
  resolveChaseStage,
  type ChaseStage,
} from './invoiceChasePolicy.js'
import { INVOICE_CHASE_SMS_FALLBACKS, buildInvoiceChaseEmail } from './invoiceChaseTemplates.js'
import { sendBrandedSms } from './sendBrandedSms.js'
import { sendTransactionalEmail } from './sendTransactionalEmail.js'
import { formatAuPhoneForSms } from './phone.js'
import { startWorkflowRun } from './workflowRun.js'
import { getPlatformUrl } from './platformUrl.js'

export interface InvoiceChaseSweepResult {
  orgs: number
  checked: number
  sent: number
}

interface InvoiceCandidate {
  id: string
  org_id: string
  lead_id: string
  invoice_number: string
  status: string
  total_amount: number
  currency: string
  customer_name: string
  customer_email: string | null
  sent_at: string
  chase_count: number
  last_chased_at: string | null
  chase_paused: boolean
  public_token: string | null
  leads: { phone: string | null } | { phone: string | null }[] | null
}

function leadPhone(row: InvoiceCandidate): string | null {
  const lead = row.leads
  if (!lead) return null
  const phone = Array.isArray(lead) ? lead[0]?.phone : lead.phone
  return phone?.trim() || null
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
      enabled: await isFeatureEnabledForOrg(row.id, 'invoice_chase'),
    }))
  )
  return checks.filter((c) => c.enabled).map((c) => c.id)
}

export async function runInvoiceChaseSweep(
  supabase: SupabaseClient
): Promise<InvoiceChaseSweepResult> {
  const enabledOrgIds = await findEnabledOrgIds(supabase)
  const result: InvoiceChaseSweepResult = {
    orgs: enabledOrgIds.length,
    checked: 0,
    sent: 0,
  }

  if (!enabledOrgIds.length) {
    console.log('[INVOICE_CHASE_SWEEP]', JSON.stringify(result))
    return result
  }

  const { data: rows, error } = await supabase
    .from('invoices')
    .select(
      'id, org_id, lead_id, invoice_number, status, total_amount, currency, customer_name, customer_email, sent_at, chase_count, last_chased_at, chase_paused, public_token, leads(phone)'
    )
    .eq('status', 'sent')
    .eq('chase_paused', false)
    .lt('chase_count', 3)
    .not('sent_at', 'is', null)
    .in('org_id', enabledOrgIds)

  if (error) {
    console.error('[INVOICE_CHASE_SWEEP_FAILED] query error:', error.message)
    console.log('[INVOICE_CHASE_SWEEP]', JSON.stringify(result))
    return result
  }

  const now = new Date()

  for (const row of (rows ?? []) as InvoiceCandidate[]) {
    const sentAt = new Date(row.sent_at)
    const overdueDays = daysOverdue(sentAt, now)
    const dueAt = deriveDueAt(sentAt)
    const lastChased = row.last_chased_at ? new Date(row.last_chased_at) : null
    const stage = resolveChaseStage(row.chase_count, overdueDays, lastChased, dueAt)
    if (!stage) continue

    result.checked += 1
    const didSend = await runInvoiceChaseForInvoice(supabase, row, stage, overdueDays, now)
    if (didSend) result.sent += 1
  }

  console.log('[INVOICE_CHASE_SWEEP]', JSON.stringify(result))
  return result
}

export async function runInvoiceChaseForInvoice(
  supabase: SupabaseClient,
  candidate: InvoiceCandidate,
  stage: ChaseStage,
  overdueDays: number,
  now: Date
): Promise<boolean> {
  const recorder = await startWorkflowRun(supabase, {
    workflowKey: 'invoice_chase',
    orgId: candidate.org_id,
    triggerSummary: { invoice_id: candidate.id, stage },
  })

  let sent = false
  let previousChaseCount = candidate.chase_count

  try {
    const { data: invoice, error: loadError } = await supabase
      .from('invoices')
      .select(
        'id, org_id, lead_id, invoice_number, status, total_amount, currency, customer_name, customer_email, sent_at, chase_count, last_chased_at, chase_paused, public_token, leads(phone)'
      )
      .eq('id', candidate.id)
      .eq('org_id', candidate.org_id)
      .maybeSingle()

    if (loadError || !invoice) {
      await recorder.step('load_invoice', 'failed', { error: loadError ?? 'Not found' })
      await recorder.finish('failed')
      return false
    }

    const loaded = invoice as InvoiceCandidate
    await recorder.step('load_invoice', 'succeeded')

    previousChaseCount = loaded.chase_count

    const flagEnabled = await isFeatureEnabledForOrg(loaded.org_id, 'invoice_chase')
    const sentAt = loaded.sent_at ? new Date(loaded.sent_at) : null
    const dueAt = sentAt ? deriveDueAt(sentAt) : null
    const lastChased = loaded.last_chased_at ? new Date(loaded.last_chased_at) : null
    const currentOverdue = sentAt ? daysOverdue(sentAt, now) : 0
    const currentStage = sentAt && dueAt
      ? resolveChaseStage(loaded.chase_count, currentOverdue, lastChased, dueAt)
      : null

    const phone = leadPhone(loaded)
    const email = loaded.customer_email?.trim() || null
    const hasContact = Boolean(phone || email)

    if (
      !flagEnabled ||
      loaded.chase_paused ||
      loaded.status !== 'sent' ||
      !sentAt ||
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
      .select('name, stripe_connect_status')
      .eq('id', loaded.org_id)
      .single()

    let payLine = ''
    let payButton = ''
    if (loaded.public_token && org?.stripe_connect_status === 'connected') {
      const cardPaymentsEnabled = await isFeatureEnabledForOrg(loaded.org_id, 'invoice_card_payments')
      if (cardPaymentsEnabled) {
        const payUrl = `${getPlatformUrl()}/api/stripe?action=invoice-pay&token=${loaded.public_token}`
        payLine = ` Pay now: ${payUrl}`
        payButton = `<p style="margin:16px 0"><a href="${payUrl}" style="background:#004B93;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Pay Now</a></p>`
      }
    }

    const messageVars = {
      firstName: firstName(loaded.customer_name),
      invoiceNumber: loaded.invoice_number,
      amount: formatInvoiceAmount(Number(loaded.total_amount), loaded.currency),
      dueDate: formatDueDateEnAu(sentAt),
      daysOverdue: String(currentOverdue),
      'org.name': org?.name?.trim() || 'Your organisation',
      payLine,
      payButton,
    }

    let channel: 'sms' | 'email' | null = null

    if (phone) {
      const smsResult = await sendBrandedSms({
        orgId: loaded.org_id,
        toPhone: formatAuPhoneForSms(phone),
        templateKey: chaseTemplateKey(stage),
        vars: messageVars,
        fallbackMessage: INVOICE_CHASE_SMS_FALLBACKS[stage],
        leadId: loaded.lead_id,
        eventType: 'sms_sent',
        eventNote: `Invoice chase reminder (stage ${stage})`,
        eventPayload: { invoice_id: loaded.id, stage },
      })

      if (!smsResult.sent) {
        await recorder.step('send_reminder', 'failed', {
          error: smsResult.error ?? smsResult.skipped ?? 'SMS not sent',
          output: { channel: 'sms', stage },
        })
        await recorder.finish('failed')
        return false
      }
      channel = 'sms'
      sent = true
    } else if (email) {
      const { subject, html } = buildInvoiceChaseEmail(stage, messageVars)
      const emailResult = await sendTransactionalEmail({ to: email, subject, html })
      if (!emailResult.sent) {
        await recorder.step('send_reminder', 'failed', {
          error: emailResult.message,
          output: { channel: 'email', stage },
        })
        await recorder.finish('failed')
        return false
      }
      channel = 'email'
      sent = true
    }

    await recorder.step('send_reminder', 'succeeded', { output: { channel, stage } })

    const chasedAt = new Date().toISOString()
    const { data: updated, error: recordError } = await supabase
      .from('invoices')
      .update({
        chase_count: previousChaseCount + 1,
        last_chased_at: chasedAt,
        updated_at: chasedAt,
      })
      .eq('id', loaded.id)
      .eq('org_id', loaded.org_id)
      .eq('chase_count', previousChaseCount)
      .select('id')
      .maybeSingle()

    if (recordError || !updated) {
      console.error('[CHASE_RECORD_FAILED]', { invoice_id: loaded.id })
      await recorder.step('record_chase', 'failed', { error: recordError ?? 'Optimistic update failed' })
      await recorder.finish('partial')
      return sent
    }

    await recorder.step('record_chase', 'succeeded')
    await recorder.finish('succeeded')
    return sent
  } catch (err) {
    console.error('[INVOICE_CHASE_RUN_FAILED]', { invoice_id: candidate.id, err })
    await recorder.finish('failed')
    return sent
  }
}
