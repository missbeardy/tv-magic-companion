import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlatformUrl } from './platformUrl.js'
import { sendEmployeeWhatsAppToPhone } from './sendEmployeeWhatsApp.js'

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

/** In-app bell + best-effort OneSignal push + WhatsApp to profile phone (service role). */
export async function notifyOrgUser(input: NotifyOrgUserInput): Promise<{ ok: boolean; error?: string }> {
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

  const appId = process.env.ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_API_KEY
  if (appId && apiKey) {
    try {
      await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${apiKey}`,
        },
        body: JSON.stringify({
          app_id: appId,
          target_channel: 'push',
          include_aliases: { external_id: [userId] },
          headings: { en: title },
          contents: { en: message },
          url: resolvedUrl,
        }),
      })
    } catch (err) {
      console.error('OneSignal push failed (non-fatal):', err)
    }
  }

  const whatsapp = await sendEmployeeWhatsAppToPhone(target.phone, title, message, resolvedUrl)
  if (whatsapp.error) {
    console.error('Employee WhatsApp failed (non-fatal):', whatsapp.error)
  }

  return { ok: true }
}
