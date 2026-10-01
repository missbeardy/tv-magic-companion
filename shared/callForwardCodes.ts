/**
 * T1.20 — GSM conditional call-divert codes a tradie dials once on their own mobile so
 * unanswered calls reach their FieldBourne answering line instead of MessageBank.
 * Standard MMI codes: they work on Telstra, Optus and Vodafone, iPhone and Android.
 */

/** Carriers accept 5–30 seconds for the no-answer timer, in steps of 5. */
export const NO_ANSWER_SECONDS_OPTIONS = [5, 10, 15, 20, 25, 30] as const
export const DEFAULT_NO_ANSWER_SECONDS = 20

export interface CallForwardCode {
  key: 'no_answer' | 'busy' | 'unreachable' | 'cancel'
  label: string
  code: string
}

/**
 * The line as the tradie would dial it domestically (04…/0x…). MMI codes accept either
 * form, but a leading "+" is awkward to type on some keypads.
 */
export function dialableAuNumber(e164OrLocal: string): string {
  const digits = e164OrLocal.replace(/\D/g, '')
  if (digits.startsWith('61') && digits.length === 11) return `0${digits.slice(2)}`
  return digits
}

export function buildCallForwardCodes(
  answeringLine: string,
  noAnswerSeconds: number = DEFAULT_NO_ANSWER_SECONDS
): CallForwardCode[] {
  const line = dialableAuNumber(answeringLine)
  const seconds = (NO_ANSWER_SECONDS_OPTIONS as readonly number[]).includes(noAnswerSeconds)
    ? noAnswerSeconds
    : DEFAULT_NO_ANSWER_SECONDS
  return [
    {
      key: 'no_answer',
      label: `Not answered after ${seconds} seconds`,
      code: `**61*${line}*11*${seconds}#`,
    },
    { key: 'busy', label: 'Busy, or you press decline', code: `**67*${line}#` },
    { key: 'unreachable', label: 'Phone off or no signal', code: `**62*${line}#` },
    { key: 'cancel', label: 'Undo all of these (back to normal voicemail)', code: '##002#' },
  ]
}

/** Display format for an AU number: 07 3123 4567 / 0412 345 678. */
export function formatAuLineForDisplay(e164OrLocal: string): string {
  const d = dialableAuNumber(e164OrLocal)
  if (d.length !== 10) return d
  return d.startsWith('04') ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`
}
