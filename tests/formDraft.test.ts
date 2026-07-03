import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearFormDraft,
  draftStorageKey,
  loadFormDraft,
  saveFormDraft,
} from '../src/lib/formDraft'
import {
  addLeadDraftHasContent,
  clearAddLeadDraft,
  saveAddLeadDraft,
} from '../src/lib/addLeadDraft'
import {
  eventModalDraftHasContent,
  eventModalDraftMatches,
  type EventModalDraft,
} from '../src/lib/eventModalDraft'

function createStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

describe('formDraft', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves and loads a draft', () => {
    saveFormDraft('user-1', 'test-form', { name: 'Jane' })
    expect(loadFormDraft<{ name: string }>('user-1', 'test-form')).toEqual({ name: 'Jane' })
  })

  it('clears expired drafts', () => {
    const key = draftStorageKey('user-1', 'test-form')
    localStorage.setItem(key, JSON.stringify({
      data: { name: 'Jane' },
      savedAt: Date.now() - 25 * 60 * 60 * 1000,
    }))
    expect(loadFormDraft('user-1', 'test-form')).toBeNull()
  })

  it('clears drafts explicitly', () => {
    saveFormDraft('user-1', 'test-form', { name: 'Jane' })
    clearFormDraft('user-1', 'test-form')
    expect(loadFormDraft('user-1', 'test-form')).toBeNull()
  })
})

describe('addLeadDraftHasContent', () => {
  it('returns false for empty draft', () => {
    expect(addLeadDraftHasContent({
      name: '',
      phone: '',
      email: '',
      address: '',
      serviceType: '',
      details: '',
    })).toBe(false)
  })

  it('returns true when any field is filled', () => {
    expect(addLeadDraftHasContent({
      name: '',
      phone: '0412',
      email: '',
      address: '',
      serviceType: '',
      details: '',
    })).toBe(true)
  })
})

describe('eventModalDraft', () => {
  it('matches lead context by lead id', () => {
    const draft = { context: 'lead', leadId: 'lead-1' } as EventModalDraft
    expect(eventModalDraftMatches(draft, { prefillLeadId: 'lead-1' })).toBe(true)
    expect(eventModalDraftMatches(draft, { prefillLeadId: 'lead-2' })).toBe(false)
  })

  it('detects meaningful booking content', () => {
    expect(eventModalDraftHasContent({
      context: 'lead',
      eventKind: 'booking',
      title: '',
      date: '2026-07-03',
      startTime: '09:00',
      endTime: '10:00',
      notes: '',
      clientName: 'Jane',
      clientPhone: '',
      clientEmail: '',
      clientAddress: '',
      clientJob: '',
      jobQuote: '',
      linkedLeadId: 'lead-1',
      linkedLeadName: 'Jane',
      assigneeId: 'tech-1',
      teamMemberIds: ['tech-1'],
      showLeadSearch: false,
    })).toBe(true)
  })
})

describe('addLeadDraft persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('persists add-lead draft under user key', () => {
    saveAddLeadDraft('user-1', {
      name: 'Jane',
      phone: '',
      email: '',
      address: '',
      serviceType: '',
      details: '',
    })
    clearAddLeadDraft('user-1')
    expect(localStorage.getItem(draftStorageKey('user-1', 'add-lead'))).toBeNull()
  })
})
