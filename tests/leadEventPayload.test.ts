import { describe, expect, it } from 'vitest'
import { buildLeadEventInsert } from '../src/lib/leadEventPayload'

describe('buildLeadEventInsert', () => {
  it('maps shared lead event fields for reporting', () => {
    expect(buildLeadEventInsert({
      leadId: 'lead-1',
      orgId: 'org-1',
      eventType: 'assigned',
      note: 'Assigned to Alex',
      actorId: 'manager-1',
      payload: { assigned_to: 'employee-1' },
    })).toEqual({
      lead_id: 'lead-1',
      org_id: 'org-1',
      event_type: 'assigned',
      note: 'Assigned to Alex',
      payload: { assigned_to: 'employee-1' },
      created_by: 'manager-1',
      actor_id: 'manager-1',
    })
  })

  it('normalizes optional fields to null', () => {
    expect(buildLeadEventInsert({
      leadId: 'lead-1',
      orgId: null,
      eventType: 'created',
    })).toEqual({
      lead_id: 'lead-1',
      org_id: null,
      event_type: 'created',
      note: null,
      payload: null,
      created_by: null,
      actor_id: null,
    })
  })
})
