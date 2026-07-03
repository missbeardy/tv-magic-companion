import { hasFormDraft, loadFormDraft, saveFormDraft, clearFormDraft } from './formDraft'

export const ADD_LEAD_FORM_ID = 'add-lead'

export interface AddLeadDraft {
  name: string
  phone: string
  email: string
  address: string
  serviceType: string
  details: string
}

export function loadAddLeadDraft(userId: string): AddLeadDraft | null {
  return loadFormDraft<AddLeadDraft>(userId, ADD_LEAD_FORM_ID)
}

export function saveAddLeadDraft(userId: string, draft: AddLeadDraft): void {
  saveFormDraft(userId, ADD_LEAD_FORM_ID, draft)
}

export function clearAddLeadDraft(userId: string): void {
  clearFormDraft(userId, ADD_LEAD_FORM_ID)
}

export function hasAddLeadDraft(userId: string): boolean {
  const draft = loadAddLeadDraft(userId)
  return draft !== null && addLeadDraftHasContent(draft)
}

export function addLeadDraftHasContent(draft: AddLeadDraft): boolean {
  return Boolean(
    draft.name.trim()
    || draft.phone.trim()
    || draft.email.trim()
    || draft.address.trim()
    || draft.serviceType.trim()
    || draft.details.trim(),
  )
}
