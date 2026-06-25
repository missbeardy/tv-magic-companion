import { getAuthHeaders } from './apiAuth'
import { formatAuPhoneForSms } from './phone'

export interface OnTheWayLead {
  id: string
  name: string
  phone: string | null | undefined
  address?: string | null
  service_type?: string | null
}

export function getOnTheWayBlockReason(
  lead: OnTheWayLead,
  featureEnabled: boolean
): string | null {
  if (!featureEnabled) {
    return 'On-the-way SMS is disabled for this franchise. Ask your platform admin to enable it.'
  }
  if (!lead.phone?.trim()) {
    return 'This lead has no phone number.'
  }
  return null
}

/** Send branded on-the-way SMS via Twilio (server-side). */
export async function sendOnTheWaySms(
  lead: OnTheWayLead,
  techName: string,
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
        leadId: lead.id,
        to: formatAuPhoneForSms(lead.phone!.trim()),
        customerName: lead.name,
        techName,
        address: lead.address?.trim() || undefined,
        serviceType: lead.service_type ?? 'service',
      }),
    })

    const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }

    if (!res.ok) {
      const detail = data.detail ? ` (${data.detail})` : ''
      return { ok: false, error: `${data.error ?? res.statusText}${detail}` }
    }

    await logEvent?.(lead.id, 'On-the-way SMS sent to customer')
    return { ok: true }
  } catch (err) {
    console.error('On-the-way SMS failed:', err)
    return { ok: false, error: 'Could not send the text. Check your connection and try again.' }
  }
}
