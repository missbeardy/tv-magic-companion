import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getHandledWorkerId,
  setHandledWorkerId,
  shouldPromptForWaitingWorker,
} from '../src/lib/pwaUpdateAck'

function createStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

describe('pwaUpdateAck', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prompts for an unacknowledged waiting worker id', () => {
    expect(shouldPromptForWaitingWorker('worker-a')).toBe(true)
  })

  it('suppresses prompt after the same worker id is acknowledged', () => {
    setHandledWorkerId('worker-a')
    expect(shouldPromptForWaitingWorker('worker-a')).toBe(false)
  })

  it('prompts again when a new waiting worker id arrives', () => {
    setHandledWorkerId('worker-a')
    expect(shouldPromptForWaitingWorker('worker-b')).toBe(true)
    expect(getHandledWorkerId()).toBe('worker-a')
  })
})
