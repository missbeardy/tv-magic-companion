import type { Org } from '../context/OrgContext'
import type { Brand } from './theme'
import { getDefaultSmsTemplates, getSmsTemplate } from './brandTemplates'
import { formatAuPhoneForSms } from './phone'

export const ON_THE_WAY_MAPS_SUFFIX = ' Track the route:'

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

function appendMapsLink(message: string, mapsUrl: string): string {
  if (!mapsUrl || message.includes(mapsUrl)) return message
  return `${message}${ON_THE_WAY_MAPS_SUFFIX} ${mapsUrl}`
}

/** Build branded on-the-way message for the technician to send from their own phone. */
export function buildOnTheWayMessage(
  lead: OnTheWayLead,
  techName: string,
  org: Org | null,
  brand: Brand | null
): string {
  const mapsUrl = lead.address?.trim()
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lead.address)}&travelmode=driving`
    : ''

  const fromBrand = getSmsTemplate(brand, 'customer_ontheway', org, {
    techName,
    mapsUrl,
  })

  if (fromBrand) {
    return appendMapsLink(fromBrand, mapsUrl)
  }

  const fallback = getDefaultSmsTemplates(org?.name ?? 'Your organisation').customer_ontheway
  const message = fallback
    .replace(/\{\{techName\}\}/g, techName)
    .replace(/\{\{org\.name\}\}/g, org?.name ?? 'Your organisation')

  return appendMapsLink(message, mapsUrl)
}

/** Open the device SMS app pre-filled for the technician to send. */
export function openOnTheWaySms(toPhone: string, message: string): void {
  const to = formatAuPhoneForSms(toPhone)
  window.location.href = `sms:${to}?body=${encodeURIComponent(message)}`
}
