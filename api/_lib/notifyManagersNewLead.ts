import { getSupabaseAdmin } from './supabaseAdmin.js'
import { buildSmsFromBrand } from './smsTemplates.js'
import { getPlatformUrl } from './platformUrl.js'
import { OPERATIONAL_MANAGER_ROLES } from './managerRoles.js'

export interface NewLeadRecord {
  id?: string
  org_id: string
  name?: string | null
  service_type?: string | null
  status: string
}

/** Alert all managers in the lead's org: in-app bell + optional SMS. */
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

  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER
  if (sid && token && from) {
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
    const credentials = Buffer.from(`${sid}:${token}`).toString('base64')

    for (const manager of managers) {
      if (!manager.phone) continue
      const bodyParams = new URLSearchParams({ To: manager.phone, From: from, Body: message })
      try {
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: bodyParams.toString(),
        })
      } catch (err) {
        console.error(`Failed to send manager alert SMS to ${manager.phone}:`, err)
      }
    }
  }

  return { notified: managers.length }
}
