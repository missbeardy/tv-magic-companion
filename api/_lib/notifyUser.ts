import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlatformUrl } from './platformUrl.js'
import { buildEmployeeWhatsAppMessage } from './employeeWhatsAppTemplates.js'
import { sendPushToUsers } from './pushTransport.js'

export interface NotifyOrgUserInput {
  supabase: SupabaseClient
  orgId: string
  userId: string
  title: string
  message: string
  url?: string
  type?: string
  leadId?: string
}

export interface NotifyOrgUserResult {
  ok: boolean
  error?: string
  alert?: { sent: boolean; channel?: 'whatsapp' | 'sms'; sid?: string; skipped?: string; error?: string }
}

/** In-app bell + best-effort OneSignal push + WhatsApp to profile phone (service role). Contact follow-up is in-app only. */
export async function notifyOrgUser(input: NotifyOrgUserInput): Promise<NotifyOrgUserResult> {
  const { supabase, orgId, userId, title, message, url, type, leadId } = input

  const { data: target, error: targetError } = await supabase
    .from('profiles')
    .select('org_id, phone')
    .eq('id', userId)
    .maybeSingle()

  if (targetError || !target || target.org_id !== orgId) {
    return { ok: false, error: 'User not in organisation' }
  }

  const { error: insertError } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type: type ?? 'lead_assigned',
    read: false,
    org_id: orgId,
    ...(leadId ? { lead_id: leadId } : {}),
    created_at: new Date().toISOString(),
  })

  if (insertError) {
    console.error('Notification insert failed:', insertError)
    return { ok: false, error: insertError.message }
  }

  const resolvedUrl = url || `${getPlatformUrl()}/leads`

  // Transport (Web Push vs OneSignal) is chosen per-brand inside sendPushToUsers.
  if (type !== 'contact_follow_up') {
    try {
      await sendPushToUsers(supabase, orgId, [userId], {
        title,
        body: message,
        url: resolvedUrl,
        ...(leadId ? { leadId } : {}),
      })
    } catch (err) {
      console.error('Push failed (non-fatal):', err)
    }
  }

  const smsBody = url ? `${title}\n\n${message}\n\n${resolvedUrl}` : `${title}\n\n${message}`
  const whatsappMessage = buildEmployeeWhatsAppMessage(
    type === 'contact_follow_up' ? 'contact_follow_up' : 'generic_notify',
    smsBody,
    { title, message, url: resolvedUrl }
  )
  // Assignment alerts are sent via send-sms mode=tech_assignment.
  // Contact-follow-up reminders stay in-app only — no push, SMS, or WhatsApp.
  let alert: NotifyOrgUserResult['alert'] = { sent: false, skipped: `Skipped for ${type}` }
  if (type !== 'lead_assigned' && type !== 'contact_follow_up') {
    const { sendEmployeeAlertToPhone } = await import('./sendEmployeeAlert.js')
    alert = await sendEmployeeAlertToPhone(target.phone, smsBody, whatsappMessage)
    if (!alert.sent) {
      console.error('Employee alert failed (non-fatal):', alert.error ?? alert.skipped)
    }
  }

  return { ok: true, alert }
}
