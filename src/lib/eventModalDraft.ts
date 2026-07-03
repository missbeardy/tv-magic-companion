import {
  clearFormDraft,
  loadFormDraft,
  saveFormDraft,
} from './formDraft'

export const EVENT_MODAL_FORM_ID = 'event-modal'

export type EventModalDraftContext = 'calendar' | 'lead' | 'edit'

export interface EventModalDraft {
  context: EventModalDraftContext
  leadId?: string
  eventId?: string
  defaultDate?: string
  eventKind: 'picker' | 'booking' | 'meeting' | 'employee'
  title: string
  date: string
  startTime: string
  endTime: string
  notes: string
  clientName: string
  clientPhone: string
  clientEmail: string
  clientAddress: string
  clientJob: string
  jobQuote: string
  linkedLeadId: string | null
  linkedLeadName: string
  assigneeId: string
  teamMemberIds: string[]
  showLeadSearch: boolean
}

interface DraftContextInput {
  existingEventId?: string
  prefillLeadId?: string
}

export function resolveEventModalContext(input: DraftContextInput): EventModalDraftContext {
  if (input.existingEventId) return 'edit'
  if (input.prefillLeadId) return 'lead'
  return 'calendar'
}

export function eventModalDraftMatches(
  draft: EventModalDraft,
  input: DraftContextInput,
): boolean {
  if (input.existingEventId) {
    return draft.context === 'edit' && draft.eventId === input.existingEventId
  }
  if (input.prefillLeadId) {
    return draft.context === 'lead' && draft.leadId === input.prefillLeadId
  }
  return draft.context === 'calendar'
}

export function loadEventModalDraft(userId: string): EventModalDraft | null {
  return loadFormDraft<EventModalDraft>(userId, EVENT_MODAL_FORM_ID)
}

export function saveEventModalDraft(userId: string, draft: EventModalDraft): void {
  saveFormDraft(userId, EVENT_MODAL_FORM_ID, draft)
}

export function clearEventModalDraft(userId: string): void {
  clearFormDraft(userId, EVENT_MODAL_FORM_ID)
}

export function hasEventModalDraftForContext(
  userId: string,
  context: EventModalDraftContext,
): boolean {
  const draft = loadEventModalDraft(userId)
  return draft?.context === context
}

export function hasLeadBookingDraft(userId: string, leadId?: string): boolean {
  const draft = loadEventModalDraft(userId)
  if (!draft || draft.context !== 'lead') return false
  if (!leadId) return true
  return draft.leadId === leadId
}

/** True when draft has user-entered content worth restoring. */
export function eventModalDraftHasContent(draft: EventModalDraft): boolean {
  return Boolean(
    draft.title.trim()
    || draft.notes.trim()
    || draft.clientName.trim()
    || draft.clientPhone.trim()
    || draft.clientEmail.trim()
    || draft.clientAddress.trim()
    || draft.clientJob.trim()
    || draft.jobQuote.trim()
    || draft.eventKind === 'meeting'
    || draft.showLeadSearch,
  )
}
