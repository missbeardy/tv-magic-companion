import { describe, expect, it } from 'vitest'
import {
  getColumnsForTab,
  getDefaultMobileTab,
  getKanbanColumns,
  getMobileTabs,
  mobileTabForStatus,
} from '../src/lib/leadsKanban'
import { isSoloOperationMode } from '../src/lib/operationMode'
import { buildSoloManualLeadFields } from '../src/lib/soloLeadAssignment'

describe('operationMode', () => {
  it('detects solo org', () => {
    expect(isSoloOperationMode({ operation_mode: 'solo' })).toBe(true)
    expect(isSoloOperationMode({ operation_mode: 'team' })).toBe(false)
    expect(isSoloOperationMode(null)).toBe(false)
  })
})

describe('soloLeadAssignment', () => {
  it('assigns to owner in solo mode', () => {
    const fields = buildSoloManualLeadFields('solo', 'user-1')
    expect(fields.status).toBe('assigned')
    expect(fields.assigned_to).toBe('user-1')
    expect(fields.assigned_at).toBeTruthy()
  })

  it('leaves unassigned in team mode', () => {
    const fields = buildSoloManualLeadFields('team', 'user-1')
    expect(fields.status).toBe('unassigned')
    expect(fields.assigned_to).toBeUndefined()
  })
})

describe('leadsKanban solo', () => {
  it('uses simplified mobile tabs', () => {
    expect(getMobileTabs(true).map((t) => t.key)).toEqual(['inbox', 'active', 'done'])
    expect(getDefaultMobileTab(true)).toBe('inbox')
  })

  it('maps statuses to solo tabs', () => {
    expect(mobileTabForStatus('assigned', true)).toBe('inbox')
    expect(mobileTabForStatus('booked', true)).toBe('active')
    expect(mobileTabForStatus('completed', true)).toBe('done')
  })

  it('filters columns for solo inbox tab', () => {
    expect(getColumnsForTab('inbox', true)).toEqual(['assigned'])
    expect(getColumnsForTab('active', true)).toContain('booked')
  })

  it('excludes unassigned column in solo desktop kanban', () => {
    const keys = getKanbanColumns(true).map((c) => c.key)
    expect(keys).not.toContain('unassigned')
    expect(keys).toContain('assigned')
  })
})
