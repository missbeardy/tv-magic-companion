import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueContactAttempt,
  getOfflineQueueCount,
  listOfflineQueue,
  MAX_OFFLINE_PHOTOS,
  enqueueLeadPhoto,
  removeOfflineQueueItem,
} from '../src/lib/offlineQueue'
import { flushOfflineQueue, shouldSkipQueuedContactAttempt } from '../src/lib/flushOfflineQueue'

const leadSelect = vi.hoisted(() => ({
  data: { status: 'assigned' } as { status: string } | null,
  error: null as { message: string } | null,
}))

const transitionLead = vi.hoisted(() => vi.fn())

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => leadSelect,
        }),
      }),
    }),
  },
}))

vi.mock('../src/lib/leadTransition', () => ({
  transitionLead: (...args: unknown[]) => transitionLead(...args),
  LEAD_TRANSITION_CONFLICT: 'CONFLICT',
}))

vi.mock('../src/lib/leadEvents', () => ({
  logLeadEvent: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('../src/lib/sentry', () => ({
  captureClientException: vi.fn(),
}))

vi.mock('../src/lib/analytics', () => ({
  trackViaRelay: vi.fn(),
}))

/** Minimal in-memory IndexedDB fake for node/jsdom. */
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

  vi.stubGlobal('indexedDB', {
    open: () => new MemOpenRequest(),
  })
  vi.stubGlobal('crypto', {
    randomUUID: () => `id-${store.size + 1}-${Math.random().toString(16).slice(2)}`,
  })

  return () => {
    store.clear()
  }
}

describe('offlineQueue', () => {
  let clearStore: () => void

  beforeEach(() => {
    clearStore = installMemoryIndexedDb()
  })

  afterEach(() => {
    clearStore()
    vi.unstubAllGlobals()
  })

  it('enqueues and lists contact attempts', async () => {
    await enqueueContactAttempt({
      leadId: 'lead-1',
      orgId: 'org-1',
      actorId: 'user-1',
      kind: 'call',
      leadStatus: 'assigned',
      contactAttemptRound: 0,
      leadName: 'Jane',
      leadPhone: '0412345678',
    })
    expect(await getOfflineQueueCount()).toBe(1)
    const items = await listOfflineQueue()
    expect(items[0]?.type).toBe('contact_attempt')
  })

  it('caps offline photos', async () => {
    for (let i = 0; i < MAX_OFFLINE_PHOTOS; i++) {
      await enqueueLeadPhoto({
        leadId: 'lead-1',
        orgId: 'org-1',
        actorId: 'user-1',
        fileName: `p${i}.jpg`,
        mimeType: 'image/jpeg',
        blob: new Blob(['x'], { type: 'image/jpeg' }),
      })
    }
    await expect(
      enqueueLeadPhoto({
        leadId: 'lead-1',
        orgId: 'org-1',
        actorId: 'user-1',
        fileName: 'overflow.jpg',
        mimeType: 'image/jpeg',
        blob: new Blob(['y'], { type: 'image/jpeg' }),
      })
    ).rejects.toThrow(/queue full/i)
  })

  it('removes items', async () => {
    const row = await enqueueContactAttempt({
      leadId: 'lead-1',
      orgId: 'org-1',
      actorId: 'user-1',
      kind: 'sms',
      leadStatus: 'unassigned',
      contactAttemptRound: null,
      leadName: 'Sam',
      leadPhone: null,
    })
    await removeOfflineQueueItem(row.id)
    expect(await getOfflineQueueCount()).toBe(0)
  })
})

describe('shouldSkipQueuedContactAttempt', () => {
  it('skips booked and terminal statuses', () => {
    expect(shouldSkipQueuedContactAttempt('booked')).toBe(true)
    expect(shouldSkipQueuedContactAttempt('completed')).toBe(true)
    expect(shouldSkipQueuedContactAttempt('lost')).toBe(true)
    expect(shouldSkipQueuedContactAttempt('booking_cancelled')).toBe(true)
    expect(shouldSkipQueuedContactAttempt('assigned')).toBe(false)
    expect(shouldSkipQueuedContactAttempt('unassigned')).toBe(false)
  })
})

describe('flushOfflineQueue contact-attempt replay', () => {
  let clearStore: () => void

  beforeEach(() => {
    clearStore = installMemoryIndexedDb()
    vi.stubGlobal('navigator', { onLine: true })
    leadSelect.data = { status: 'assigned' }
    leadSelect.error = null
    transitionLead.mockReset()
    transitionLead.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    clearStore()
    vi.unstubAllGlobals()
  })

  it('does not write when the lead is already booked', async () => {
    leadSelect.data = { status: 'booked' }
    await enqueueContactAttempt({
      leadId: 'lead-1',
      orgId: 'org-1',
      actorId: 'user-1',
      kind: 'call',
      leadStatus: 'assigned',
      contactAttemptRound: 0,
      leadName: 'Jane',
      leadPhone: '0412345678',
    })

    const result = await flushOfflineQueue()
    expect(transitionLead).not.toHaveBeenCalled()
    expect(result.processed).toBe(1)
    expect(await getOfflineQueueCount()).toBe(0)
  })

  it('keeps the item when the status write is rejected', async () => {
    transitionLead.mockResolvedValue({ ok: false, error: 'RLS denied' })
    await enqueueContactAttempt({
      leadId: 'lead-1',
      orgId: 'org-1',
      actorId: 'user-1',
      kind: 'call',
      leadStatus: 'assigned',
      contactAttemptRound: 0,
      leadName: 'Jane',
      leadPhone: '0412345678',
    })

    const result = await flushOfflineQueue()
    expect(result.failed).toBe(1)
    expect(await getOfflineQueueCount()).toBe(1)
  })
})
