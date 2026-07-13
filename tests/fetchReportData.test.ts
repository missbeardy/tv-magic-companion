import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMonthStart } from '../src/lib/reporting/dateRange'

const mockState = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; filters: Record<string, unknown>; single: boolean }>,
  resolvers: new Map<string, (query: { table: string; filters: Record<string, unknown>; single: boolean }) => {
    data?: unknown
    error?: unknown
  }>(),
}))

vi.mock('../src/lib/supabase', () => {
  class QueryBuilder {
    private readonly table: string
    private readonly filters: Record<string, unknown> = {}

    constructor(table: string) {
      this.table = table
    }

    select() {
      return this
    }

    eq(column: string, value: unknown) {
      this.filters[`eq:${column}`] = value
      return this
    }

    is(column: string, value: unknown) {
      this.filters[`is:${column}`] = value
      return this
    }

    gte(column: string, value: unknown) {
      this.filters[`gte:${column}`] = value
      return this
    }

    lt(column: string, value: unknown) {
      this.filters[`lt:${column}`] = value
      return this
    }

    ['in'](column: string, value: unknown) {
      this.filters[`in:${column}`] = value
      return this
    }

    order() {
      return this
    }

    limit() {
      return this
    }

    maybeSingle() {
      return Promise.resolve(this.execute(true))
    }

    then(onFulfilled?: (value: { data: unknown; error: unknown }) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(this.execute(false)).then(onFulfilled, onRejected)
    }

    private execute(single: boolean) {
      const query = { table: this.table, filters: { ...this.filters }, single }
      mockState.calls.push(query)
      const resolver = mockState.resolvers.get(this.table)
      const response = resolver ? resolver(query) : {}
      return {
        data: response.data ?? (single ? null : []),
        error: response.error ?? null,
      }
    }
  }

  return {
    supabase: {
      from: (table: string) => new QueryBuilder(table),
    },
  }
})

import { fetchReportingData } from '../src/lib/reporting/fetchReportData'

describe('fetchReportingData', () => {
  beforeEach(() => {
    mockState.calls.length = 0
    mockState.resolvers.clear()
  })

  it('reads closed months from snapshot tables', async () => {
    mockState.resolvers.set('monthly_org_reports', () => ({
      data: {
        month_start: '2026-04-01',
        leads_received: 9,
        assignments: 7,
        unassigned: 1,
        contact_attempts: 6,
        bookings: 4,
        completed: 3,
        lost: 2,
        expired: 1,
        booking_cancelled: 1,
        review_requests: 2,
        assigned_to_contacted_numerator: 6,
        assigned_to_contacted_denominator: 7,
        contacted_to_booked_numerator: 4,
        contacted_to_booked_denominator: 6,
        booked_to_completed_numerator: 3,
        booked_to_completed_denominator: 4,
        source_breakdown: [{ source: 'SMS', count: 5 }],
      },
    }))
    mockState.resolvers.set('monthly_agent_reports', () => ({
      data: [
        {
          agent_id: 'agent-1',
          agent_name: 'Taylor',
          agent_role: 'employee',
          assignments: 3,
          contact_attempts: 2,
          bookings: 1,
          completed: 1,
          lost: 0,
          expired: 0,
          booking_cancelled: 0,
          review_requests: 1,
        },
      ],
    }))
    mockState.resolvers.set('profiles', () => ({
      data: [{ id: 'agent-1', full_name: 'Taylor', role: 'employee' }],
    }))

    const result = await fetchReportingData('org-1', new Date('2026-04-12T00:00:00.000Z'))

    expect(result.summary.leadsReceived).toBe(9)
    expect(result.summary.completed).toBe(3)
    expect(result.agentRows).toHaveLength(1)
    expect(result.sourceBreakdown).toEqual([{ source: 'SMS', count: 5 }])
    expect(result.conversions.bookedToCompleted).toMatchObject({ numerator: 3, denominator: 4, rate: 0.75 })
    expect(mockState.calls.some((call) => call.table === 'lead_events')).toBe(false)
    expect(mockState.calls.some((call) => call.table === 'leads')).toBe(false)
  })

  it('reads current month from live leads and events', async () => {
    mockState.resolvers.set('lead_events', () => ({
      data: [
        {
          lead_id: 'lead-1',
          event_type: 'assigned',
          created_at: new Date().toISOString(),
          created_by: 'manager-1',
          actor_id: 'manager-1',
          payload: { assigned_to: 'employee-1' },
        },
      ],
    }))
    mockState.resolvers.set('leads', () => ({
      data: [
        {
          id: 'lead-1',
          source: 'manual',
          lead_source: 'Manual',
          status: 'assigned',
          created_at: new Date().toISOString(),
          assigned_to: 'employee-1',
        },
      ],
    }))
    mockState.resolvers.set('profiles', () => ({
      data: [{ id: 'employee-1', full_name: 'Tech One', role: 'employee' }],
    }))

    const result = await fetchReportingData('org-1', getMonthStart(new Date()))

    expect(result.summary.leadsReceived).toBe(1)
    expect(mockState.calls.some((call) => call.table === 'lead_events')).toBe(true)
    expect(mockState.calls.some((call) => call.table === 'monthly_org_reports')).toBe(false)
  })

  it('falls back to live aggregation when closed-month snapshot row is missing', async () => {
    mockState.resolvers.set('monthly_org_reports', () => ({ data: null }))
    mockState.resolvers.set('monthly_agent_reports', () => ({ data: [] }))
    mockState.resolvers.set('lead_events', () => ({ data: [] }))
    mockState.resolvers.set('leads', () => ({
      data: [
        {
          id: 'lead-1',
          source: 'sms',
          lead_source: 'SMS',
          status: 'completed',
          created_at: '2026-02-01T00:00:00.000Z',
          assigned_to: 'employee-1',
        },
      ],
    }))
    mockState.resolvers.set('profiles', () => ({
      data: [{ id: 'employee-1', full_name: 'Tech One', role: 'employee' }],
    }))

    const result = await fetchReportingData('org-1', new Date('2026-02-10T00:00:00.000Z'))

    expect(result.summary.leadsReceived).toBe(1)
    expect(mockState.calls.some((call) => call.table === 'monthly_org_reports')).toBe(true)
    expect(mockState.calls.some((call) => call.table === 'lead_events')).toBe(true)
  })

  it('falls back to live aggregation when snapshot tables are unavailable', async () => {
    mockState.resolvers.set('monthly_org_reports', () => ({
      error: { code: '42P01', message: 'relation "monthly_org_reports" does not exist' },
    }))
    mockState.resolvers.set('monthly_agent_reports', () => ({ data: [] }))
    mockState.resolvers.set('lead_events', () => ({ data: [] }))
    mockState.resolvers.set('leads', () => ({
      data: [
        {
          id: 'lead-1',
          source: 'manual',
          lead_source: 'Manual',
          status: 'lost',
          created_at: '2026-01-01T00:00:00.000Z',
          assigned_to: null,
        },
      ],
    }))
    mockState.resolvers.set('profiles', () => ({ data: [] }))

    const result = await fetchReportingData('org-1', new Date('2026-01-04T00:00:00.000Z'))

    expect(result.summary.leadsReceived).toBe(1)
    expect(mockState.calls.some((call) => call.table === 'lead_events')).toBe(true)
  })
})
