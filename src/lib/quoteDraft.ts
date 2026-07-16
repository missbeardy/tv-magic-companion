import { clearFormDraft, loadFormDraft, saveFormDraft } from './formDraft'
import type { LineItem } from './lineItems'

export const QUOTE_FORM_ID = 'quote'

export interface QuoteDraft {
  leadId: string
  leadName: string
  leadPhone?: string | null
  leadEmail?: string | null
  serviceType?: string | null
  scope: string
  terms: string
  totalAmount: string
  expiryDays: string
  lineItems?: LineItem[]
}

export function loadQuoteDraft(userId: string): QuoteDraft | null {
  return loadFormDraft<QuoteDraft>(userId, QUOTE_FORM_ID)
}

export function saveQuoteDraft(userId: string, draft: QuoteDraft): void {
  saveFormDraft(userId, QUOTE_FORM_ID, draft)
}

export function clearQuoteDraft(userId: string): void {
  clearFormDraft(userId, QUOTE_FORM_ID)
}

export function hasQuoteDraft(userId: string): boolean {
  const draft = loadQuoteDraft(userId)
  return draft !== null && quoteDraftHasContent(draft)
}

export function quoteDraftHasContent(draft: QuoteDraft): boolean {
  const defaultScope = `Service: ${draft.serviceType ?? 'General service'}\n\nIncludes:`
  const defaultTerms = 'Payment due on completion unless agreed otherwise.'
  return Boolean(
    draft.scope.trim() !== defaultScope.trim()
    || draft.terms.trim() !== defaultTerms.trim()
    || draft.totalAmount.trim() !== '180'
    || draft.expiryDays.trim() !== '7'
    || (draft.lineItems && draft.lineItems.length > 0),
  )
}

export function quoteDraftToLead(draft: QuoteDraft) {
  return {
    id: draft.leadId,
    name: draft.leadName,
    phone: draft.leadPhone ?? null,
    email: draft.leadEmail ?? null,
    service_type: draft.serviceType ?? null,
  }
}
