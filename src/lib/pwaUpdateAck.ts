const HANDLED_UPDATE_KEY = 'companion-pwa-update-handled-id'

export function getHandledWorkerId(): string | null {
  try {
    return localStorage.getItem(HANDLED_UPDATE_KEY)
  } catch {
    return null
  }
}

export function setHandledWorkerId(workerId: string): void {
  try {
    localStorage.setItem(HANDLED_UPDATE_KEY, workerId)
  } catch {
    // private browsing / storage blocked
  }
}

/** True when the waiting worker should surface the update prompt. */
export function shouldPromptForWaitingWorker(waitingId: string): boolean {
  return getHandledWorkerId() !== waitingId
}
