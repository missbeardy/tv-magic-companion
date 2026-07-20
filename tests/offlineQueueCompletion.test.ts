import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueCompletion,
  enqueueLeadNote,
  listOfflineQueue,
  getOfflineQueueCount,
} from '../src/lib/offlineQueue'
import {
  shouldApplyQueuedCompletion,
  completeLeadOrEnqueue,
  saveLeadNoteOrEnqueue,
} from '../src/lib/offlineWrites'

/** Minimal in-memory IndexedDB fake for node/jsdom (mirrors offlineQueue.test.ts). */
function installMemoryIndexedDb() {
  type Row = { id: string; [key: string]: unknown }
  const store = new Map<string, Row>()

  class MemRequest<T> {
    result: T
    error: DOMException | null = null
    onsuccess: ((ev: Event) => void) | null = null
    onerror: ((ev: Event) => void) | null = null
    constructor(result: T) {
      this.result = result
      queueMicrotask(() => this.onsuccess?.(new Event('success')))
    }
  }

  class MemStore {
    put(row: Row) {
      store.set(row.id, row)
      return new MemRequest(row.id)
    }
    delete(id: string) {
      store.delete(id)
      return new MemRequest(undefined)
    }
    getAll() {
      return new MemRequest([...store.values()])
    }
  }

  class MemTx {
    objectStore() {
      return new MemStore()
    }
    onerror: ((ev: Event) => void) | null = null
  }

  class MemDb {
    objectStoreNames = { contains: () => true }
    transaction() {
      return new MemTx()
    }
  }

  class MemOpenRequest {
    result = new MemDb()
    error: DOMException | null = null
    onupgradeneeded: ((ev: Event) => void) | null = null
    onsuccess: ((ev: Event) => void) | null = null
    onerror: ((ev: Event) => void) | null = null
    constructor() {
      queueMicrotask(() => {
        this.onupgradeneeded?.(new Event('upgradeneeded'))
        this.onsuccess?.(new Event('success'))
      })
    }
  }

  vi.stubGlobal('indexedDB', { open: () => new MemOpenRequest() })
  vi.stubGlobal('crypto', {
    randomUUID: () => `id-${store.size + 1}-${Math.random().toString(16).slice(2)}`,
  })

  return () => store.clear()
}

describe('shouldApplyQueuedCompletion (conflict guard)', () => {
  it('applies to a lead still in progress', () => {
    expect(shouldApplyQueuedCompletion('assigned')).toBe(true)
    expect(shouldApplyQueuedCompletion('booked')).toBe(true)
    expect(shouldApplyQueuedCompletion('contact_attempted')).toBe(true)
  })

  it('skips a lead already completed or lost (prevents double-completion)', () => {
    expect(shouldApplyQueuedCompletion('completed')).toBe(false)
    expect(shouldApplyQueuedCompletion('lost')).toBe(false)
  })

  it('treats missing status as safe to apply', () => {
    expect(shouldApplyQueuedCompletion('')).toBe(true)
    expect(shouldApplyQueuedCompletion(null)).toBe(true)
    expect(shouldApplyQueuedCompletion(undefined)).toBe(true)
  })
})

describe('offline completion + note queue', () => {
  let clearStore: () => void

  beforeEach(() => {
    clearStore = installMemoryIndexedDb()
    vi.stubGlobal('navigator', { onLine: false })
  })

  afterEach(() => {
    clearStore()
    vi.unstubAllGlobals()
  })

  it('enqueues a completion item with the originating status', async () => {
    await enqueueCompletion({
      leadId: 'lead-1',
      orgId: 'org-1',
      actorId: 'user-1',
      fromStatus: 'booked',
      leadName: 'Jane',
    })
    const items = await listOfflineQueue()
    expect(items).toHaveLength(1)
    expect(items[0]?.type).toBe('completion')
    expect(items[0]).toMatchObject({ leadId: 'lead-1', fromStatus: 'booked' })
  })

  it('enqueues a lead note item', async () => {
    await enqueueLeadNote({
      leadId: 'lead-1',
      orgId: 'org-1',
      actorId: 'user-1',
      note: 'gate code 4412',
    })
    const items = await listOfflineQueue()
    expect(items[0]?.type).toBe('lead_note')
    expect(items[0]).toMatchObject({ note: 'gate code 4412' })
  })

  it('completeLeadOrEnqueue queues instead of writing when offline', async () => {
    const mode = await completeLeadOrEnqueue({
      leadId: 'lead-9',
      orgId: 'org-1',
      actorId: 'user-1',
      fromStatus: 'booked',
      leadName: 'Nick',
    })
    expect(mode).toBe('queued')
    expect(await getOfflineQueueCount()).toBe(1)
    const items = await listOfflineQueue()
    expect(items[0]?.type).toBe('completion')
  })

  it('saveLeadNoteOrEnqueue queues and trims the note when offline', async () => {
    const mode = await saveLeadNoteOrEnqueue({
      leadId: 'lead-9',
      orgId: 'org-1',
      actorId: 'user-1',
      note: '  wants two TVs  ',
    })
    expect(mode).toBe('queued')
    const items = await listOfflineQueue()
    expect(items[0]).toMatchObject({ type: 'lead_note', note: 'wants two TVs' })
  })
})
