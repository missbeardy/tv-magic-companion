import { describe, expect, it } from 'vitest'
import { aggregateReportingData } from '../src/lib/reporting/aggregateReports'
import { buildMonthOptions, buildReportPeriod, getMonthKey, getMonthStart } from '../src/lib/reporting/dateRange'
import type { AgentProfileRow, LeadEventRow, LeadRow } from '../src/lib/reporting/types'

describe('aggregateReportingData', () => {
  it('aggregates team and agent activity from lead events', () => {
    const profiles: AgentProfileRow[] = [
      { id: 'manager-1', full_name: 'Alice Manager', role: 'manager' },
      { id: 'employee-1', full_name: 'Bob Tech', role: 'employee' },
    ]

    const leads: LeadRow[] = [
      { id: 'lead-1', source: 'manual', lead_source: 'Manual Entry', status: 'completed', created_at: '2026-06-01T00:00:00.000Z', assigned_to: 'employee-1' },
      { id: 'lead-2', source: 'sms', lead_source: 'SMS', status: 'lost', created_at: '2026-06-04T00:00:00.000Z', assigned_to: 'employee-1' },
      { id: 'lead-3', source: 'email', lead_source: 'Inbound Email', status: 'booking_cancelled', created_at: '2026-06-06T00:00:00.000Z', assigned_to: 'manager-1' },
    ]

    const events: LeadEventRow[] = [
      {
        lead_id: 'lead-1',
        event_type: 'assigned',
        created_at: '2026-06-02T00:00:00.000Z',
        created_by: 'manager-1',
        actor_id: 'manager-1',
        payload: { assigned_to: 'employee-1' },
      },
      {
        lead_id: 'lead-1',
        event_type: 'call_attempted',
        created_at: '2026-06-02T02:00:00.000Z',
        created_by: 'employee-1',
        actor_id: 'employee-1',
        payload: null,
      },
      {
        lead_id: 'lead-1',
        event_type: 'booked',
        created_at: '2026-06-02T05:00:00.000Z',
        created_by: 'employee-1',
        actor_id: 'employee-1',
        payload: null,
      },
      {
        lead_id: 'lead-1',
        event_type: 'completed',
        created_at: '2026-06-03T06:00:00.000Z',
        created_by: 'employee-1',
        actor_id: 'employee-1',
        payload: null,
      },
      {
        lead_id: 'lead-1',
        event_type: 'status_change',
        created_at: '2026-06-03T07:00:00.000Z',
        created_by: 'employee-1',
        actor_id: 'employee-1',
        payload: { to_status: 'completed' },
      },
      {
        lead_id: 'lead-1',
        event_type: 'review_request',
        created_at: '2026-06-03T08:00:00.000Z',
        created_by: 'employee-1',
        actor_id: 'employee-1',
        payload: null,
      },
      {
        lead_id: 'lead-2',
        event_type: 'assigned',
        created_at: '2026-06-04T00:00:00.000Z',
        created_by: 'manager-1',
        actor_id: 'manager-1',
        payload: { assigned_to: 'employee-1' },
      },
      {
        lead_id: 'lead-2',
        event_type: 'sms_attempted',
        created_at: '2026-06-04T01:00:00.000Z',
        created_by: 'employee-1',
        actor_id: 'employee-1',
        payload: null,
      },
      {
        lead_id: 'lead-2',
        event_type: 'lost',
        created_at: '2026-06-05T00:00:00.000Z',
        created_by: 'manager-1',
        actor_id: 'manager-1',
        payload: null,
      },
      {
        lead_id: 'lead-3',
        event_type: 'assigned',
        created_at: '2026-06-06T00:00:00.000Z',
        created_by: 'manager-1',
        actor_id: 'manager-1',
        payload: { assigned_to: 'manager-1' },
      },
      {
        lead_id: 'lead-3',
        event_type: 'contact_attempted',
        created_at: '2026-06-06T03:00:00.000Z',
        created_by: 'manager-1',
        actor_id: 'manager-1',
        payload: null,
      },
      {
        lead_id: 'lead-3',
        event_type: 'booked',
        created_at: '2026-06-06T04:00:00.000Z',
        created_by: 'manager-1',
        actor_id: 'manager-1',
        payload: null,
      },
      {
        lead_id: 'lead-3',
        event_type: 'booking_cancelled',
        created_at: '2026-06-07T00:00:00.000Z',
        created_by: 'manager-1',
        actor_id: 'manager-1',
        payload: null,
      },
    ]

    const result = aggregateReportingData(events, leads, profiles)

    expect(result.summary).toMatchObject({
      leadsReceived: 3,
      assignments: 3,
      contactAttempts: 3,
      bookings: 2,
      completed: 1,
      lost: 1,
      expired: 0,
      bookingCancelled: 1,
      reviewRequests: 1,
    })

    expect(result.conversions.assignedToContacted).toMatchObject({ numerator: 3, denominator: 3, rate: 1 })
    expect(result.conversions.contactedToBooked).toMatchObject({ numerator: 2, denominator: 3 })
    expect(result.conversions.bookedToCompleted).toMatchObject({ numerator: 1, denominator: 2, rate: 0.5 })

    expect(result.timing.avgHoursToFirstContact).toBe(2)
    expect(result.timing.avgHoursToBooking).toBe(4.5)
    expect(result.timing.firstContactSamples).toBe(3)
    expect(result.timing.bookingSamples).toBe(2)

    const bob = result.agentRows.find((row) => row.agentId === 'employee-1')
    const alice = result.agentRows.find((row) => row.agentId === 'manager-1')
    expect(bob).toMatchObject({
      assignments: 2,
      contactAttempts: 2,
      bookings: 1,
      completed: 1,
      reviewRequests: 1,
    })
    expect(alice).toMatchObject({
      assignments: 1,
      contactAttempts: 1,
      bookings: 1,
      lost: 1,
      bookingCancelled: 1,
    })
  })

  it('handles empty input safely', () => {
    const result = aggregateReportingData([], [], [])
    expect(result.summary.leadsReceived).toBe(0)
    expect(result.agentRows).toHaveLength(0)
    expect(result.sourceBreakdown).toHaveLength(0)
    expect(result.conversions.assignedToContacted.rate).toBeNull()
    expect(result.timing.avgHoursToFirstContact).toBeNull()
  })
})

describe('report date helpers', () => {
  it('builds an inclusive month period', () => {
    const period = buildReportPeriod(new Date('2026-06-15T10:30:00.000Z'))
    expect(getMonthKey(period.monthStart)).toBe('2026-06')
    expect(getMonthKey(period.monthEnd)).toBe('2026-07')
  })

  it('builds month options newest first', () => {
    const options = buildMonthOptions(getMonthStart(new Date('2026-03-19T00:00:00.000Z')), getMonthStart(new Date('2026-06-01T00:00:00.000Z')))
    expect(options.map((d) => getMonthKey(d))).toEqual(['2026-06', '2026-05', '2026-04', '2026-03'])
  })
})
