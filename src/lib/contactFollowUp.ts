export {
  CONTACT_FOLLOW_UP_MS,
  MAX_CONTACT_ATTEMPTS,
  MAX_RETRY_WAIT_ROUND,
  FINAL_LABEL_ROUND,
  LOST_REASON_UNABLE_TO_CONTACT,
  CONTACT_FOLLOW_UP_HOURS,
  type ContactFollowUpLead,
  getAttemptPhaseLabel,
  isFollowUpRolloverDue,
  leadsDueForFollowUpReminder,
  leadsDueForFollowUpEscalation,
  leadsDueForFollowUpAutoLost,
  leadsDueForFollowUpRollover,
  buildFollowUpEscalationUpdate,
  buildFollowUpRolloverUpdate,
  buildUnableToContactLostUpdate,
  type RetryAttemptEventType,
  escalationEventType,
  rolloverEventType,
  type ContactAttemptResult,
  buildContactAttemptUpdate,
  formatEscalationEventNote,
  buildFollowUpNotificationCopy,
  processContactFollowUpRollovers,
  sortLeadsForKanbanColumn,
} from '../../shared/contactFollowUp'

export function getContactFollowUpState(lastAttemptAt: string | null | undefined): {
  elapsedMs: number
  label: string
} {
  const elapsedMs = lastAttemptAt
    ? Math.max(0, Date.now() - new Date(lastAttemptAt).getTime())
    : 0
  const totalMinutes = Math.floor(elapsedMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const label = hours > 0 ? `${hours}h ${minutes}m` : `${Math.max(minutes, 0)}m`
  return { elapsedMs, label }
}
