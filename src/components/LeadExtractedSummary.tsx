import { Phone, Mail, MapPin } from 'lucide-react'
import { getLeadDisplayDetails } from '../lib/leadDisplay'
import { openNavigation } from '../lib/navigation'

export interface LeadSummaryFields {
  phone?: string | null
  email?: string | null
  address?: string | null
  details?: string | null
  lead_source?: string | null
  raw_email?: string | null
  raw_sms?: string | null
}

interface LeadExtractedSummaryProps {
  lead: LeadSummaryFields
  size?: 'sm' | 'md'
  detailsClamp?: boolean
  showLeadSource?: boolean
  showAddress?: boolean
}

function formatRawSms(rawSms: string): string {
  try {
    return JSON.stringify(JSON.parse(rawSms), null, 2)
  } catch {
    return rawSms
  }
}

export function LeadRawSource({ lead }: { lead: Pick<LeadSummaryFields, 'raw_email' | 'raw_sms'> }) {
  if (!lead.raw_email && !lead.raw_sms) return null

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3">
      {lead.raw_email && (
        <details>
          <summary className="text-xs font-medium text-gray-500 cursor-pointer select-none">
            View original email / transcript
          </summary>
          <pre className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap overflow-auto max-h-48">
            {lead.raw_email}
          </pre>
        </details>
      )}
      {lead.raw_sms && (
        <details>
          <summary className="text-xs font-medium text-gray-500 cursor-pointer select-none">
            View original SMS / call details
          </summary>
          <pre className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap overflow-auto max-h-48">
            {formatRawSms(lead.raw_sms)}
          </pre>
        </details>
      )}
    </div>
  )
}

export default function LeadExtractedSummary({
  lead,
  size = 'sm',
  detailsClamp = false,
  showLeadSource = false,
  showAddress = true,
}: LeadExtractedSummaryProps) {
  const displayDetails = getLeadDisplayDetails(lead)
  const textSize = size === 'md' ? 'text-sm' : 'text-xs'
  const iconSize = size === 'md' ? 12 : 10

  const hasContactInfo = lead.phone || lead.email || (showAddress && lead.address) || displayDetails

  if (!hasContactInfo && !(showLeadSource && lead.lead_source)) return null

  return (
    <div className={`space-y-1.5 ${size === 'md' ? 'py-1' : ''}`}>
      {(lead.phone || lead.email) && (
        <div className={`flex items-center gap-3 flex-wrap ${size === 'md' ? 'mt-1' : ''}`}>
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              onClick={e => e.stopPropagation()}
              className={`flex items-center gap-1 ${textSize} text-gray-500 hover:text-[#004B93]`}
            >
              <Phone size={iconSize} className="shrink-0" />
              {lead.phone}
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              onClick={e => e.stopPropagation()}
              className={`flex items-center gap-1 ${textSize} text-gray-500 hover:text-[#004B93] truncate`}
            >
              <Mail size={iconSize} className="shrink-0" />
              {lead.email}
            </a>
          )}
        </div>
      )}

      {showAddress && lead.address && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            openNavigation(lead.address as string)
          }}
          className={`flex items-center gap-1 ${textSize} text-[#00B4C5] hover:underline text-left`}
        >
          <MapPin size={iconSize} className="shrink-0" />
          {lead.address}
        </button>
      )}

      {displayDetails && (
        <p
          className={`${textSize} text-gray-500 leading-relaxed ${detailsClamp ? 'line-clamp-2' : ''} ${size === 'md' ? 'mt-2' : 'mt-1'}`}
        >
          {displayDetails}
        </p>
      )}

      {showLeadSource && lead.lead_source && (
        <span className="inline-block text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 mt-1">
          {lead.lead_source}
        </span>
      )}
    </div>
  )
}
