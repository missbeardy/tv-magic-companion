import { clearFormDraft, loadFormDraft, saveFormDraft } from './formDraft'

// Persists progress through the job-completion ceremony (which step, which
// checklist items are ticked) so a mid-flow interruption — a phone call that
// reloads the PWA — can resume where the tradie left off instead of restarting.

export const COMPLETION_FORM_ID = 'completion'

export interface CompletionDraft {
  leadId: string
  step: 'checklist' | 'invoice' | 'review'
  checked: boolean[]
  upsellDone: boolean
}

export function loadCompletionDraft(userId: string): CompletionDraft | null {
  return loadFormDraft<CompletionDraft>(userId, COMPLETION_FORM_ID)
}

export function saveCompletionDraft(userId: string, draft: CompletionDraft): void {
  saveFormDraft(userId, COMPLETION_FORM_ID, draft)
}

export function clearCompletionDraft(userId: string): void {
  clearFormDraft(userId, COMPLETION_FORM_ID)
}
