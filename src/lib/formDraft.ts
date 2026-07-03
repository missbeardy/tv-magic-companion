const PREFIX = 'tvmagic:draft'
const TTL_MS = 24 * 60 * 60 * 1000

export interface StoredDraft<T> {
  data: T
  savedAt: number
}

export function draftStorageKey(userId: string, formId: string): string {
  return `${PREFIX}:${userId}:${formId}`
}

export function saveFormDraft<T>(userId: string, formId: string, data: T): void {
  try {
    const payload: StoredDraft<T> = { data, savedAt: Date.now() }
    localStorage.setItem(draftStorageKey(userId, formId), JSON.stringify(payload))
  } catch {
    // private browsing / quota
  }
}

export function loadFormDraft<T>(userId: string, formId: string): T | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(userId, formId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<T>
    if (!parsed?.data || Date.now() - parsed.savedAt > TTL_MS) {
      clearFormDraft(userId, formId)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

export function hasFormDraft(userId: string, formId: string): boolean {
  return loadFormDraft(userId, formId) !== null
}

export function clearFormDraft(userId: string, formId: string): void {
  try {
    localStorage.removeItem(draftStorageKey(userId, formId))
  } catch {
    // ignore
  }
}
