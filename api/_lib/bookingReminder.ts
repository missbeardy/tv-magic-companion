import type { SupabaseClient } from '@supabase/supabase-js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import {
  REMINDER_WINDOW_MAX_HOURS,
  REMINDER_WINDOW_MIN_HOURS,
  isBookingCancelled,
  isReminderDue,
  isWithinQuietHours,
} from './bookingReminderPolicy.js'
import { sendBrandedSms } from './sendBrandedSms.js'
import { startWorkflowRun } from './workflowRun.js'

export interface BookingReminderSweepResult {
  orgs: number
  checked: number
  sent: number
}

interface EventCandidate {
  id: string
  org_id: string
  lead_id: string | null
  start_time: string
  client_name: string | null
  client_phone: string | null
  client_job: string | null
  reminder_sent_at: string | null
  leads: { status: string } | { status: string }[] | null
  profiles: { full_name: string } | { full_name: string }[] | null
}

function leadStatus(row: EventCandidate): string | null {
  const lead = row.leads
  if (!lead) return null
  return (Array.isArray(lead) ? lead[0]?.status : lead.status) ?? null
}

function techName(row: EventCandidate): string {
  const profile = row.profiles
  if (!profile) return ''
  const name = Array.isArray(profile) ? profile[0]?.full_name : profile.full_name
  return name?.trim() ?? ''
}

function formatAuDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

async function findEnabledOrgIds(supabase: SupabaseClient): Promise<string[]> {
  const { data: orgRows, error } = await supabase.from('orgs').select('id')
  if (error || !orgRows?.length) return []

  const checks = await Promise.all(
    orgRows.map(async (row) => ({
      id: row.id as string,
      enabled: await isFeatureEnabledForOrg(row.id, 'booking_reminder_sms'),
    }))
  )
  return checks.filter((c) => c.enabled).map((c) => c.id)
}

const EVENT_COLUMNS =
  'id, org_id, lead_id, start_time, client_name, client_phone, client_job, reminder_sent_at, leads(status), profiles(full_name)'

export async function runBookingReminderSweep(
  supabase: SupabaseClient
): Promise<BookingReminderSweepResult> {
  const enabledOrgIds = await findEnabledOrgIds(supabase)
  const result: BookingReminderSweepResult = {
    orgs: enabledOrgIds.length,
    checked: 0,
    sent: 0,
  }

  if (!enabledOrgIds.length) {
    console.log('[BOOKING_REMINDER_SWEEP]', JSON.stringify(result))
    return result
  }

  const now = new Date()
  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_MIN_HOURS * 3_600_000)
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MAX_HOURS * 3_600_000)

  const { data: rows, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .is('reminder_sent_at', null)
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString())
    .in('org_id', enabledOrgIds)

  if (error) {
    console.error('[BOOKING_REMINDER_SWEEP_FAILED] query error:', error.message)
    console.log('[BOOKING_REMINDER_SWEEP]', JSON.stringify(result))
    return result
  }

  for (const row of (rows ?? []) as unknown as EventCandidate[]) {
    if (isBookingCancelled(leadStatus(row))) continue
    if (!row.client_phone?.trim()) continue

    result.checked += 1
    const didSend = await runBookingReminderForEvent(supabase, row, now)
    if (didSend) result.sent += 1
  }

  console.log('[BOOKING_REMINDER_SWEEP]', JSON.stringify(result))
  return result
}

export async function runBookingReminderForEvent(
  supabase: SupabaseClient,
  candidate: EventCandidate,
  now: Date
): Promise<boolean> {
  const recorder = await startWorkflowRun(supabase, {
    workflowKey: 'booking_reminder',
    orgId: candidate.org_id,
    triggerSummary: { event_id: candidate.id },
  })

  try {
    const { data: event, error: loadError } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('id', candidate.id)
      .eq('org_id', candidate.org_id)
      .maybeSingle()

    if (loadError || !event) {
      await recorder.step('load_event', 'failed', { error: loadError ?? 'Not found' })
      await recorder.finish('failed')
      return false
    }

    const loaded = event as unknown as EventCandidate
    await recorder.step('load_event', 'succeeded')

    const flagEnabled = await isFeatureEnabledForOrg(loaded.org_id, 'booking_reminder_sms')
    const startTime = new Date(loaded.start_time)
    const reminderSentAt = loaded.reminder_sent_at ? new Date(loaded.reminder_sent_at) : null
    const due = isReminderDue(startTime, now, reminderSentAt)
    const cancelled = isBookingCancelled(leadStatus(loaded))
    const phone = loaded.client_phone?.trim() || null

    const { data: org } = await supabase
      .from('orgs')
      .select('name, timezone')
      .eq('id', loaded.org_id)
      .maybeSingle()

    const withinQuietHours = isWithinQuietHours(now, org?.timezone || 'Australia/Perth')

    if (!flagEnabled || !due || cancelled || !phone || !withinQuietHours) {
      await recorder.step('policy_check', 'skipped')
      await recorder.finish('succeeded')
      return false
    }

    await recorder.step('policy_check', 'succeeded')

    const tech = techName(loaded)
    const messageVars = {
      customerName: loaded.client_name?.trim() || 'there',
      'org.name': org?.name?.trim() || 'Your organisation',
      dateTime: formatAuDateTime(loaded.start_time),
      techLine: tech ? ` Your technician is ${tech}.` : '',
      serviceType: loaded.client_job?.trim() || 'appointment',
    }

    const smsResult = await sendBrandedSms({
      orgId: loaded.org_id,
      toPhone: phone,
      templateKey: 'customer_booking_reminder',
      vars: messageVars,
      fallbackMessage:
        'Hi {{customerName}}, just a reminder — your {{serviceType}} appointment with {{org.name}} is tomorrow, {{dateTime}}.{{techLine}} See you then!',
      leadId: loaded.lead_id ?? undefined,
      eventType: 'booking_reminder_sent',
      eventNote: 'Day-before booking reminder SMS sent',
      eventPayload: { event_id: loaded.id, start_time: loaded.start_time },
    })

    if (!smsResult.sent) {
      await recorder.step('send_reminder', 'failed', {
        error: smsResult.error ?? smsResult.skipped ?? 'SMS not sent',
      })
      await recorder.finish('failed')
      return false
    }

    await recorder.step('send_reminder', 'succeeded')

    const { data: updated, error: recordError } = await supabase
      .from('events')
      .update({ reminder_sent_at: now.toISOString() })
      .eq('id', loaded.id)
      .eq('org_id', loaded.org_id)
      .is('reminder_sent_at', null)
      .select('id')
      .maybeSingle()

    if (recordError || !updated) {
      console.error('[BOOKING_REMINDER_RECORD_FAILED]', { event_id: loaded.id })
      await recorder.step('record_reminder', 'failed', { error: recordError ?? 'Optimistic update failed' })
      await recorder.finish('partial')
      return true
    }

    await recorder.step('record_reminder', 'succeeded')
    await recorder.finish('succeeded')
    return true
  } catch (err) {
    console.error('[BOOKING_REMINDER_RUN_FAILED]', { event_id: candidate.id, err })
    await recorder.finish('failed')
    return false
  }
}
