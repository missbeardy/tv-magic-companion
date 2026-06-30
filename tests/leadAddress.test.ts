import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; action: string; payload?: unknown; filters: Record<string, unknown> }>,
  resolvers: new Map<
    string,
    (query: { table: string; action: string; payload?: unknown; filters: Record<string, unknown> }) => {
      data?: unknown
      error?: { message: string } | null
    }
  >(),
}))

vi.mock('../src/lib/supabase', () => {
  class QueryBuilder {
    private readonly table: string
    private readonly action: string
    private payload: unknown
    private readonly filters: Record<string, unknown> = {}

    constructor(table: string, action: string, payload?: unknown) {
      this.table = table
      this.action = action
      this.payload = payload
    }

    select() {
      return this
    }

    update(payload: unknown) {
      this.payload = payload
      return this
    }

    insert(payload: unknown) {
      this.payload = payload
      return this
    }

    eq(column: string, value: unknown) {
      this.filters[`eq:${column}`] = value
      return this
    }

    gte(column: string, value: unknown) {
      this.filters[`gte:${column}`] = value
      return this
    }

    then(onFulfilled?: (value: { data: unknown; error: unknown }) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(this.execute()).then(onFulfilled, onRejected)
    }

    private execute() {
      const query = {
        table: this.table,
        action: this.action,
        payload: this.payload,
        filters: { ...this.filters },
      }
      mockState.calls.push(query)
      const resolver = mockState.resolvers.get(`${this.table}:${this.action}`)
      const response = resolver ? resolver(query) : {}
      return {
        data: response.data ?? null,
        error: response.error ?? null,
      }
    }
  }

  return {
    supabase: {
      from: (table: string) => ({
        update: (payload: unknown) => new QueryBuilder(table, 'update', payload),
        insert: (payload: unknown) => new QueryBuilder(table, 'insert', payload),
      }),
    },
  }
})

const logLeadEvent = vi.fn()
vi.mock('../src/lib/leadEvents', () => ({
  logLeadEvent: (...args: unknown[]) => logLeadEvent(...args),
}))

import { updateLeadAddress } from '../src/lib/leadAddress'

describe('updateLeadAddress', () => {
  beforeEach(() => {
    mockState.calls.length = 0
    mockState.resolvers.clear()
    logLeadEvent.mockReset()
    logLeadEvent.mockResolvedValue({ error: null })
  })

  it('updates lead, future events, and logs address change', async () => {
    mockState.resolvers.set('leads:update', () => ({ error: null }))
    mockState.resolvers.set('events:update', () => ({ error: null }))

    const result = await updateLeadAddress('lead-1', '  10 Test St  ', 'org-1', 'user-1')

    expect(result).toEqual({})
    expect(mockState.calls).toHaveLength(2)

    expect(mockState.calls[0]).toMatchObject({
      table: 'leads',
      action: 'update',
      payload: { address: '10 Test St' },
      filters: { 'eq:id': 'lead-1' },
    })

    expect(mockState.calls[1]).toMatchObject({
      table: 'events',
      action: 'update',
      payload: { client_address: '10 Test St' },
      filters: { 'eq:lead_id': 'lead-1' },
    })
    expect(mockState.calls[1].filters['gte:start_time']).toBeTruthy()

    expect(logLeadEvent).toHaveBeenCalledWith({
      leadId: 'lead-1',
      orgId: 'org-1',
      eventType: 'status_change',
      note: 'Address updated',
      actorId: 'user-1',
      payload: { address: '10 Test St' },
    })
  })

  it('stores null when address is blank', async () => {
    mockState.resolvers.set('leads:update', () => ({ error: null }))
    mockState.resolvers.set('events:update', () => ({ error: null }))

    await updateLeadAddress('lead-1', '   ', 'org-1', 'user-1')

    expect(mockState.calls[0].payload).toEqual({ address: null })
    expect(mockState.calls[1].payload).toEqual({ client_address: null })
  })

  it('returns lead update error without touching events', async () => {
    mockState.resolvers.set('leads:update', () => ({ error: { message: 'lead failed' } }))

    const result = await updateLeadAddress('lead-1', '10 Test St', 'org-1', 'user-1')

    expect(result).toEqual({ error: 'lead failed' })
    expect(mockState.calls).toHaveLength(1)
    expect(logLeadEvent).not.toHaveBeenCalled()
  })

  it('returns events update error', async () => {
    mockState.resolvers.set('leads:update', () => ({ error: null }))
    mockState.resolvers.set('events:update', () => ({ error: { message: 'events failed' } }))

    const result = await updateLeadAddress('lead-1', '10 Test St', 'org-1', 'user-1')

    expect(result).toEqual({ error: 'events failed' })
    expect(logLeadEvent).not.toHaveBeenCalled()
  })

  it('returns log error after successful updates', async () => {
    mockState.resolvers.set('leads:update', () => ({ error: null }))
    mockState.resolvers.set('events:update', () => ({ error: null }))
    logLeadEvent.mockResolvedValue({ error: { message: 'log failed' } })

    const result = await updateLeadAddress('lead-1', '10 Test St', 'org-1', 'user-1')

    expect(result).toEqual({ error: 'log failed' })
  })
})
