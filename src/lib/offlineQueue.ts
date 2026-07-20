const DB_NAME = 'tvm-offline-queue'
const DB_VERSION = 2
const STORE = 'items'
const STORE_CACHE = 'cache'
export const MAX_OFFLINE_PHOTOS = 10

export type OfflineContactKind = 'call' | 'sms'

export interface OfflineContactAttemptItem {
  id: string
  type: 'contact_attempt'
  createdAt: string
  leadId: string
  orgId: string
  actorId: string
  kind: OfflineContactKind
  leadStatus: string
  contactAttemptRound: number | null
  leadName: string
  leadPhone: string | null
}

export interface OfflineLeadPhotoItem {
  id: string
  type: 'lead_photo'
  createdAt: string
  leadId: string
  orgId: string
  actorId: string
  fileName: string
  mimeType: string
  blob: Blob
}

export interface OfflineCompletionItem {
  id: string
  type: 'completion'
  createdAt: string
  leadId: string
  orgId: string
  actorId: string
  fromStatus: string
  leadName: string
}

export interface OfflineLeadNoteItem {
  id: string
  type: 'lead_note'
  createdAt: string
  leadId: string
  orgId: string
  actorId: string
  note: string
}

export type OfflineQueueItem =
  | OfflineContactAttemptItem
  | OfflineLeadPhotoItem
  | OfflineCompletionItem
  | OfflineLeadNoteItem

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach((l) => l())
}

export function subscribeOfflineQueue(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open offline queue DB'))
  })
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function listOfflineQueue(): Promise<OfflineQueueItem[]> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    const items = await reqToPromise(tx.objectStore(STORE).getAll())
    return ((items as OfflineQueueItem[]) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } catch {
    return []
  }
}

export async function getOfflineQueueCount(): Promise<number> {
  const items = await listOfflineQueue()
  return items.length
}

export async function enqueueContactAttempt(
  item: Omit<OfflineContactAttemptItem, 'id' | 'type' | 'createdAt'>
): Promise<OfflineContactAttemptItem> {
  const row: OfflineContactAttemptItem = {
    ...item,
    id: crypto.randomUUID(),
    type: 'contact_attempt',
    createdAt: new Date().toISOString(),
  }
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await reqToPromise(tx.objectStore(STORE).put(row))
  notify()
  return row
}

export async function enqueueLeadPhoto(
  item: Omit<OfflineLeadPhotoItem, 'id' | 'type' | 'createdAt'>
): Promise<OfflineLeadPhotoItem> {
  const existing = await listOfflineQueue()
  const photoCount = existing.filter((i) => i.type === 'lead_photo').length
  if (photoCount >= MAX_OFFLINE_PHOTOS) {
    throw new Error(`Offline photo queue full (max ${MAX_OFFLINE_PHOTOS}). Go online to sync.`)
  }
  const row: OfflineLeadPhotoItem = {
    ...item,
    id: crypto.randomUUID(),
    type: 'lead_photo',
    createdAt: new Date().toISOString(),
  }
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await reqToPromise(tx.objectStore(STORE).put(row))
  notify()
  return row
}

export async function enqueueCompletion(
  item: Omit<OfflineCompletionItem, 'id' | 'type' | 'createdAt'>
): Promise<OfflineCompletionItem> {
  const row: OfflineCompletionItem = {
    ...item,
    id: crypto.randomUUID(),
    type: 'completion',
    createdAt: new Date().toISOString(),
  }
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await reqToPromise(tx.objectStore(STORE).put(row))
  notify()
  return row
}

export async function enqueueLeadNote(
  item: Omit<OfflineLeadNoteItem, 'id' | 'type' | 'createdAt'>
): Promise<OfflineLeadNoteItem> {
  const row: OfflineLeadNoteItem = {
    ...item,
    id: crypto.randomUUID(),
    type: 'lead_note',
    createdAt: new Date().toISOString(),
  }
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await reqToPromise(tx.objectStore(STORE).put(row))
  notify()
  return row
}

export async function removeOfflineQueueItem(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await reqToPromise(tx.objectStore(STORE).delete(id))
  notify()
}

export async function listPendingPhotosForLead(leadId: string): Promise<OfflineLeadPhotoItem[]> {
  const items = await listOfflineQueue()
  return items.filter((i): i is OfflineLeadPhotoItem => i.type === 'lead_photo' && i.leadId === leadId)
}

// --- Generic read-through cache (separate store, shares the queue DB) ---
// Used to keep the last successful leads/schedule fetch available when a later
// fetch fails offline. Best-effort: all reads/writes swallow errors.

export async function cachePut(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_CACHE, 'readwrite')
    await reqToPromise(tx.objectStore(STORE_CACHE).put({ key, value }))
  } catch {
    // caching is best-effort — never let it break the caller
  }
}

export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_CACHE, 'readonly')
    const row = (await reqToPromise(tx.objectStore(STORE_CACHE).get(key))) as
      | { key: string; value: T }
      | undefined
    return row?.value ?? null
  } catch {
    return null
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_CACHE, 'readwrite')
    await reqToPromise(tx.objectStore(STORE_CACHE).delete(key))
  } catch {
    // best-effort
  }
}
