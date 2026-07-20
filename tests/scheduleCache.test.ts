import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  saveLeadsCache,
  loadLeadsCache,
  saveEventsCache,
  loadEventsCache,
} from '../src/lib/scheduleCache'

/** In-memory IndexedDB fake keyed by the record's `key` (the cache store's keyPath). */
function installMemoryIndexedDb() {
  const store = new Map<string, { key: string; value: unknown }>()

  class MemRequest<T> {
    result: T
    onsuccess: ((ev: Event) => void) | null = null
    onerror: ((ev: Event) => void) | null = null
    constructor(result: T) {
      this.result = result
      queueMicrotask(() => this.onsuccess?.(new Event('success')))
    }
  }

  class MemStore {
    put(row: { key: string; value: unknown }) {
      store.set(row.key, row)
      return new MemRequest(row.key)
    }
    get(key: string) {
      return new MemRequest(store.get(key))
    }
    delete(key: string) {
      store.delete(key)
      return new MemRequest(undefined)
    }
  }

  class MemTx {
    objectStore() {
      return new MemStore()
    }
  }

  class MemDb {
    objectStoreNames = { contains: () => true }
    transaction() {
      return new MemTx()
    }
  }

  class MemOpenRequest {
    result = new MemDb()
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
  return () => store.clear()
}

describe('scheduleCache (offline read cache)', () => {
  let clearStore: () => void

  beforeEach(() => {
    clearStore = installMemoryIndexedDb()
  })

  afterEach(() => {
    clearStore()
    vi.unstubAllGlobals()
  })

  it('round-trips leads for a user', async () => {
    const leads = [{ id: 'l1', name: 'Jane', phone: '0412345678' }]
    await saveLeadsCache('user-1', leads)
    const cached = await loadLeadsCache('user-1')
    expect(cached?.leads).toEqual(leads)
    expect(typeof cached?.cachedAt).toBe('number')
  })

  it('keeps leads and events under separate keys (no collision)', async () => {
    await saveLeadsCache('user-1', [{ id: 'l1' }])
    await saveEventsCache('user-1', [{ id: 'e1' }])
    expect((await loadLeadsCache('user-1'))?.leads).toEqual([{ id: 'l1' }])
    expect((await loadEventsCache('user-1'))?.events).toEqual([{ id: 'e1' }])
  })

  it('scopes cache per user', async () => {
    await saveLeadsCache('user-1', [{ id: 'l1' }])
    expect(await loadLeadsCache('user-2')).toBeNull()
  })

  it('returns null for an empty/missing userId', async () => {
    await saveLeadsCache('', [{ id: 'l1' }])
    expect(await loadLeadsCache('')).toBeNull()
  })

  it('treats entries older than the TTL as a miss', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    await saveLeadsCache('user-1', [{ id: 'l1' }])
    now.mockReturnValue(1_000_000 + 61_000) // 61s later, TTL 60s
    expect(await loadLeadsCache('user-1', 60_000)).toBeNull()
    now.mockRestore()
  })

  it('caches an empty leads list (a real "no jobs" state, not a miss)', async () => {
    await saveLeadsCache('user-1', [])
    const cached = await loadLeadsCache('user-1')
    expect(cached?.leads).toEqual([])
  })
})
