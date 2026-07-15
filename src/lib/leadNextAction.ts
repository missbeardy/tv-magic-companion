export type LeadNextActionKind = 'assign' | 'self_assign' | 'call' | 'quote' | 'book' | 'complete'

export interface LeadNextActionInput {
  status: string
  latestQuoteStatus?: string | null
  quoteEnabled: boolean
  hideAssignPool?: boolean
  isManager: boolean
  isEmployee: boolean
}

export interface LeadNextAction {
  kind: LeadNextActionKind
  label: string
  /** Tailwind / btn classes for primary button. */
  className: string
}

/**
 * Single primary CTA for a lead card/sheet. Secondary actions stay in the sheet.
 */
export function resolveLeadNextAction(input: LeadNextActionInput): LeadNextAction | null {
  const {
    status,
    latestQuoteStatus,
    quoteEnabled,
    hideAssignPool = false,
    isManager,
    isEmployee,
  } = input

  if (status === 'completed' || status === 'lost' || status === 'expired') {
    return null
  }

  if (status === 'unassigned') {
    if (hideAssignPool) return null
    if (isManager) {
      return { kind: 'assign', label: 'Assign to Technician', className: 'bg-brand text-white' }
    }
    if (isEmployee) {
      return { kind: 'self_assign', label: 'Self-Assign This Lead', className: 'bg-brand text-white' }
    }
    return null
  }

  if (status === 'booked' || status === 'booking_cancelled') {
    if (status === 'booked') {
      return { kind: 'complete', label: 'Complete Job', className: 'bg-green-600 text-white' }
    }
  }

  const quoteAccepted = latestQuoteStatus === 'accepted'
  if (quoteAccepted && status !== 'booked') {
    return { kind: 'book', label: 'Book Job', className: 'bg-[var(--color-primary)] text-white' }
  }

  if (status === 'assigned' || status === 'contact_attempted') {
    // Managers with quoting enabled and no quote yet → send quote first
    if (quoteEnabled && isManager && !latestQuoteStatus) {
      return { kind: 'quote', label: 'Send Quote', className: 'bg-gray-900 text-white' }
    }
    return { kind: 'call', label: 'Call Customer', className: 'bg-[var(--color-primary)] text-white' }
  }

  return null
}
