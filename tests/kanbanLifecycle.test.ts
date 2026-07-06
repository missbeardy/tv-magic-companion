import { describe, expect, it } from 'vitest'
import {
  buildKanbanPathFromEvents,
  statusFromLeadEvent,
  type LeadEventRow,
} from '../shared/kanbanLifecycle'

function event(
  overrides: Partial<LeadEventRow> & Pick<LeadEventRow, 'event_type' | 'created_at'>
): LeadEventRow {
  return {
    id: 'evt-1',
    lead_id: 'lead-1',
    payload: null,
    note: null,
    ...overrides,
  }
}

describe('statusFromLeadEvent', () => {
  it('maps created to unassigned', () => {
    expect(statusFromLeadEvent(event({ event_type: 'created', created_at: '2026-07-07T10:00:00Z' }))).toBe(
      'unassigned'
    )
  })

  it('prefers payload to_status over event_type', () => {
    expect(
      statusFromLeadEvent(
        event({
          event_type: 'status_change',
          created_at: '2026-07-07T10:01:00Z',
          payload: { from_status: 'assigned', to_status: 'booked' },
        })
      )
    ).toBe('booked')
  })

  it('maps expired to unassigned', () => {
    expect(statusFromLeadEvent(event({ event_type: 'expired', created_at: '2026-07-07T10:02:00Z' }))).toBe(
      'unassigned'
    )
  })

  it('ignores non-status events', () => {
    expect(
      statusFromLeadEvent(event({ event_type: 'sms_sent', created_at: '2026-07-07T10:03:00Z' }))
    ).toBeNull()
  })
})

describe('buildKanbanPathFromEvents', () => {
  it('builds actual path and dedupes consecutive identical statuses', () => {
    const events: LeadEventRow[] = [
      event({ id: 'e1', event_type: 'created', created_at: '2026-07-07T10:00:00Z' }),
      event({ id: 'e2', event_type: 'assigned', created_at: '2026-07-07T10:05:00Z' }),
      event({
        id: 'e3',
        event_type: 'status_change',
        created_at: '2026-07-07T10:10:00Z',
        payload: { from_status: 'assigned', to_status: 'contact_attempted' },
      }),
      event({
        id: 'e4',
        event_type: 'contact_attempted',
        created_at: '2026-07-07T10:15:00Z',
        payload: { from_status: 'contact_attempted', to_status: 'contact_attempted' },
      }),
      event({ id: 'e5', event_type: 'booked', created_at: '2026-07-07T11:00:00Z' }),
    ]

    const path = buildKanbanPathFromEvents(events, 'booked')

    expect(path.map((n) => n.status)).toEqual([
      'unassigned',
      'assigned',
      'contact_attempted',
      'booked',
    ])
    expect(path[path.length - 1].isCurrent).toBe(true)
    expect(path[0].event?.id).toBe('e1')
  })

  it('appends current status when it differs from last event-derived status', () => {
    const events: LeadEventRow[] = [
      event({ id: 'e1', event_type: 'created', created_at: '2026-07-07T10:00:00Z' }),
      event({ id: 'e2', event_type: 'assigned', created_at: '2026-07-07T10:05:00Z' }),
    ]

    const path = buildKanbanPathFromEvents(events, 'contact_attempted')

    expect(path.map((n) => n.status)).toEqual(['unassigned', 'assigned', 'contact_attempted'])
    expect(path[2].isCurrent).toBe(true)
    expect(path[2].event).toBeNull()
  })

  it('shows pool return path after expiry', () => {
    const events: LeadEventRow[] = [
      event({ id: 'e1', event_type: 'created', created_at: '2026-07-07T10:00:00Z' }),
      event({ id: 'e2', event_type: 'assigned', created_at: '2026-07-07T10:05:00Z' }),
      event({ id: 'e3', event_type: 'expired', created_at: '2026-07-07T10:30:00Z' }),
    ]

    const path = buildKanbanPathFromEvents(events, 'unassigned')

    expect(path.map((n) => n.status)).toEqual(['unassigned', 'assigned', 'unassigned'])
    expect(path[2].isCurrent).toBe(true)
  })

  it('returns single current node when no status events exist', () => {
    const path = buildKanbanPathFromEvents([], 'assigned')
    expect(path).toHaveLength(1)
    expect(path[0]).toMatchObject({ status: 'assigned', isCurrent: true })
  })
})
