import { describe, expect, it } from 'vitest'
import {
  buildKanbanPathFromEvents,
  collectKanbanProfileIds,
  describeKanbanAttribution,
  enrichKanbanPathAttribution,
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

describe('describeKanbanAttribution', () => {
  const names = new Map([
    ['actor-1', 'Jane Manager'],
    ['tech-1', 'Sam Tech'],
    ['prev-1', 'Pat Previous'],
  ])

  it('marks created as initial', () => {
    const attr = describeKanbanAttribution(
      event({ event_type: 'created', created_at: '2026-07-07T10:00:00Z' }),
      'unassigned',
      names
    )
    expect(attr).toMatchObject({
      mode: 'initial',
      summary: 'Lead opened in pool',
      subtitle: 'Initial',
    })
  })

  it('marks inbound auto-assign as automated with assignee', () => {
    const attr = describeKanbanAttribution(
      event({
        event_type: 'assigned',
        created_at: '2026-07-07T10:05:00Z',
        payload: { assigned_to: 'tech-1', source: 'inbound_auto_assign' },
        note: 'Lead auto-assigned to Sam Tech',
      }),
      'assigned',
      names
    )
    expect(attr).toMatchObject({
      mode: 'automated',
      subtitle: 'Auto',
      actorLabel: 'System',
      assigneeLabel: 'Sam Tech',
      summary: 'Automated · assigned to Sam Tech',
      sourceLabel: 'inbound auto-assign',
    })
  })

  it('marks manager_assign as manual by actor name', () => {
    const attr = describeKanbanAttribution(
      event({
        event_type: 'assigned',
        created_at: '2026-07-07T10:05:00Z',
        actor_id: 'actor-1',
        payload: { assigned_to: 'tech-1', source: 'manager_assign' },
      }),
      'assigned',
      names
    )
    expect(attr).toMatchObject({
      mode: 'manual',
      subtitle: 'by Jane Manager',
      actorLabel: 'Jane Manager',
      assigneeLabel: 'Sam Tech',
      summary: 'Manual by Jane Manager · to Sam Tech',
      sourceLabel: 'manager assign',
    })
  })

  it('marks unassigned with actor and previous assignee', () => {
    const attr = describeKanbanAttribution(
      event({
        event_type: 'unassigned',
        created_at: '2026-07-07T10:40:00Z',
        actor_id: 'actor-1',
        payload: {
          from_status: 'assigned',
          to_status: 'unassigned',
          previous_assignee_id: 'prev-1',
        },
        note: 'Manually unassigned by manager',
      }),
      'unassigned',
      names
    )
    expect(attr).toMatchObject({
      mode: 'manual',
      subtitle: 'by Jane Manager',
      actorLabel: 'Jane Manager',
      assigneeLabel: 'Pat Previous',
      summary: 'Manual by Jane Manager (prev: Pat Previous)',
    })
  })

  it('marks expired as automated', () => {
    const attr = describeKanbanAttribution(
      event({
        event_type: 'expired',
        created_at: '2026-07-07T10:30:00Z',
        payload: { previous_assignee_id: 'prev-1', source: 'assign_timer' },
      }),
      'unassigned',
      names
    )
    expect(attr).toMatchObject({
      mode: 'automated',
      subtitle: 'Auto',
      actorLabel: 'System',
      assigneeLabel: 'Pat Previous',
      sourceLabel: 'assign timer',
    })
  })

  it('returns null for non assign/unassign statuses', () => {
    expect(
      describeKanbanAttribution(
        event({ event_type: 'booked', created_at: '2026-07-07T11:00:00Z' }),
        'booked',
        names
      )
    ).toBeNull()
  })
})

describe('collectKanbanProfileIds / enrichKanbanPathAttribution', () => {
  it('collects actor, assignee, and previous assignee ids', () => {
    const ids = collectKanbanProfileIds([
      event({
        id: 'e1',
        event_type: 'assigned',
        created_at: '2026-07-07T10:05:00Z',
        actor_id: 'actor-1',
        created_by: 'actor-1',
        payload: { assigned_to: 'tech-1', source: 'manager_assign' },
      }),
      event({
        id: 'e2',
        event_type: 'unassigned',
        created_at: '2026-07-07T10:40:00Z',
        created_by: 'actor-2',
        payload: { previous_assignee_id: 'tech-1', to_status: 'unassigned' },
      }),
    ])
    expect(ids.sort()).toEqual(['actor-1', 'actor-2', 'tech-1'])
  })

  it('attaches attribution only to assigned/unassigned path nodes', () => {
    const events: LeadEventRow[] = [
      event({ id: 'e1', event_type: 'created', created_at: '2026-07-07T10:00:00Z' }),
      event({
        id: 'e2',
        event_type: 'assigned',
        created_at: '2026-07-07T10:05:00Z',
        actor_id: 'actor-1',
        payload: { assigned_to: 'tech-1', source: 'manager_assign' },
      }),
      event({ id: 'e3', event_type: 'booked', created_at: '2026-07-07T11:00:00Z' }),
    ]
    const path = buildKanbanPathFromEvents(events, 'booked')
    const enriched = enrichKanbanPathAttribution(
      path,
      new Map([
        ['actor-1', 'Jane Manager'],
        ['tech-1', 'Sam Tech'],
      ])
    )

    expect(enriched[0].attribution?.mode).toBe('initial')
    expect(enriched[1].attribution?.mode).toBe('manual')
    expect(enriched[1].attribution?.subtitle).toBe('by Jane Manager')
    expect(enriched[2].attribution).toBeNull()
  })
})
