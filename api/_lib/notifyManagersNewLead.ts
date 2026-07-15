import { getSupabaseAdmin } from './supabaseAdmin.js'
import { buildSmsFromBrand } from './smsTemplates.js'
import { getPlatformUrl } from './platformUrl.js'
import { OPERATIONAL_MANAGER_ROLES } from './managerRoles.js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { sendEmployeeAlertWithSmsFallback } from './sendEmployeeAlert.js'
import { buildEmployeeWhatsAppMessage } from './employeeWhatsAppTemplates.js'

export interface NewLeadRecord {
  id?: string
  org_id: string
  name?: string | null
  service_type?: string | null
  status: string
}

/** Alert all managers in the lead's org: in-app bell + optional WhatsApp (SMS fallback). */
export async function notifyManagersNewLead(
  lead: NewLeadRecord
): Promise<{ notified: number; skipped?: string }> {
  if (lead.status !== 'unassigned') {
    return { notified: 0, skipped: 'Lead is already assigned' }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    throw new Error('Server not configured')
  }

  const { data: managers } = await supabase
    .from('profiles')
    .select('id, phone')
    .eq('org_id', lead.org_id)
    .in('role', [...OPERATIONAL_MANAGER_ROLES])

  if (!managers?.length) {
    return { notified: 0, skipped: 'No managers found for org' }
  }

  const { data: org } = await supabase
    .from('orgs')
    .select('name, brand_id')
    .eq('id', lead.org_id)
    .single()

  let smsTemplates: Record<string, string> | undefined
  if (org?.brand_id) {
    const { data: brandRow } = await supabase
      .from('brands')
      .select('sms_templates')
      .eq('id', org.brand_id)
      .maybeSingle()
    smsTemplates = brandRow?.sms_templates as Record<string, string> | undefined
  }

  const orgName = org?.name ?? 'Your organisation'
  const leadName = lead.name || 'Unknown'
  const serviceType = lead.service_type || 'General'
  const platformUrl = getPlatformUrl()

  const { error: insertError } = await supabase.from('notifications').insert(
    managers.map((m) => ({
      user_id: m.id,
      title: 'New Unassigned Lead',
      message: `${leadName} needs assigning (${serviceType}).`,
      type: 'new_lead',
      read: false,
      org_id: lead.org_id,
      ...(lead.id ? { lead_id: lead.id } : {}),
    }))
  )
  if (insertError) {
    console.error('Manager notification insert failed:', insertError)
    throw new Error('Failed to record notifications')
  }

  const alertsEnabled = await isFeatureEnabledForOrg(lead.org_id, 'manager_new_lead_alerts')

  const title = 'New Unassigned Lead'
  const alertMessage = `${leadName} needs assigning (${serviceType}).`
  const leadsUrl = `${platformUrl}/leads`

  const appId = process.env.ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_API_KEY
  if (appId && apiKey && alertsEnabled) {
    const pushUrl = lead.id ? `${leadsUrl}?highlight=${lead.id}` : leadsUrl
    for (const manager of managers) {
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
            include_aliases: { external_id: [manager.id] },
            headings: { en: title },
            contents: { en: alertMessage },
            url: pushUrl,
          }),
        })
      } catch (err) {
        console.error(`OneSignal new-lead push failed for ${manager.id} (non-fatal):`, err)
      }
    }
  }

  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (sid && token && alertsEnabled) {
    const message = buildSmsFromBrand(
      smsTemplates,
      'manager_alert',
      {
        'org.name': orgName,
        leadName,
        serviceType,
        appUrl: `${platformUrl}/leads`,
      },
      `${orgName}: A new lead has been submitted — ${leadName} (${serviceType}). Please review and assign a technician: ${platformUrl}/leads`
    )

    for (const manager of managers) {
      if (!manager.phone) continue
      try {
        const waMessage = buildEmployeeWhatsAppMessage('manager_alert', message, {
          orgName,
          leadName,
          serviceType,
          appUrl: `${platformUrl}/leads`,
        })
        const result = await sendEmployeeAlertWithSmsFallback({
          toPhone: manager.phone,
          smsBody: message,
          whatsAppMessage: waMessage,
        })
        if (!result.sent) {
          console.error(`Failed to send manager alert to ${manager.phone}:`, result.error ?? result.skipped)
        }
      } catch (err) {
        console.error(`Failed to send manager alert WhatsApp to ${manager.phone}:`, err)
      }
    }
  }

  return { notified: managers.length }
}
