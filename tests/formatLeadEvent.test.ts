import { describe, expect, it } from 'vitest'
import { formatLeadEventDisplay } from '../src/lib/formatLeadEvent'

describe('formatLeadEventDisplay', () => {
  it('prefers note when present', () => {
    const result = formatLeadEventDisplay({
      eventType: 'assigned',
      note: 'Assigned to Alex',
      actorName: 'Jordan',
      leadName: 'John Smith',
    })
    expect(result.text).toBe('Jordan: Assigned to Alex')
  })

  it('formats assigned without note', () => {
    const result = formatLeadEventDisplay({
      eventType: 'assigned',
      actorName: 'Alex',
      leadName: 'Jane Doe',
    })
    expect(result.text).toBe('Alex assigned Jane Doe')
  })

  it('formats status_change using payload to_status', () => {
    const result = formatLeadEventDisplay({
      eventType: 'status_change',
      actorName: 'Alex',
      leadName: 'Jane Doe',
      payload: { from_status: 'assigned', to_status: 'booked' },
    })
    expect(result.text).toBe('Alex moved Jane Doe to booked')
  })

  it('uses fallback labels when names missing', () => {
    const result = formatLeadEventDisplay({
      eventType: 'completed',
    })
    expect(result.text).toBe('Someone completed a lead')
  })

  it('handles unknown event types', () => {
    const result = formatLeadEventDisplay({
      eventType: 'custom_event',
      actorName: 'Alex',
      leadName: 'Test Lead',
    })
    expect(result.text).toBe('Alex updated Test Lead')
  })

  it('formats expired assign timer with previous assignee name', () => {
    const result = formatLeadEventDisplay({
      eventType: 'expired',
      leadName: 'John Smith',
      payload: { previous_assignee_name: 'Alex Jones' },
    })
    expect(result.text).toBe('John Smith assign timer expired (Alex Jones did not act in time)')
  })
})
