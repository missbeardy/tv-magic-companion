import { describe, expect, it } from 'vitest'
import { buildWorkflowGraphNodes, type WorkflowStepRow } from '../shared/workflowGraph'
import { INBOUND_LEAD_STEP_IDS } from '../shared/workflowRegistry'

function makeStep(
  nodeId: string,
  seq: number,
  status: WorkflowStepRow['status'],
  overrides: Partial<WorkflowStepRow> = {}
): WorkflowStepRow {
  return {
    id: `step-${seq}`,
    run_id: 'run-1',
    node_id: nodeId,
    seq,
    status,
    output: null,
    error: null,
    started_at: '2026-07-07T00:00:00.000Z',
    finished_at: '2026-07-07T00:00:01.000Z',
    ...overrides,
  }
}

describe('buildWorkflowGraphNodes', () => {
  it('maps all registry steps with correct statuses for inbound_lead', () => {
    const stepRows = INBOUND_LEAD_STEP_IDS.map((id, index) =>
      makeStep(id, index + 1, index === 2 ? 'failed' : index === 3 ? 'skipped' : 'succeeded')
    )

    const { nodes } = buildWorkflowGraphNodes('inbound_lead', stepRows, 'horizontal')

    expect(nodes).toHaveLength(INBOUND_LEAD_STEP_IDS.length)
    expect(nodes[0]).toMatchObject({ nodeId: 'insert_lead', label: 'Save lead', status: 'succeeded' })
    expect(nodes[2]).toMatchObject({ nodeId: 'extract', label: 'AI extraction', status: 'failed' })
    expect(nodes[3]).toMatchObject({ nodeId: 'apply_extraction', status: 'skipped' })
    expect(nodes[0].position).toEqual({ x: 0, y: 0 })
    expect(nodes[1].position).toEqual({ x: 200, y: 0 })
  })

  it('marks missing step rows as unreached', () => {
    const stepRows = [
      makeStep('insert_lead', 1, 'succeeded'),
      makeStep('created_event', 2, 'succeeded'),
    ]

    const { nodes } = buildWorkflowGraphNodes('inbound_lead', stepRows, 'horizontal')

    expect(nodes.find((n) => n.nodeId === 'extract')?.status).toBe('unreached')
    expect(nodes.find((n) => n.nodeId === 'follow_up_sms')?.status).toBe('unreached')
  })

  it('appends unknown node_id rows at the end in seq order', () => {
    const stepRows = [
      makeStep('insert_lead', 1, 'succeeded'),
      makeStep('future_step', 9, 'succeeded'),
      makeStep('another_unknown', 10, 'failed'),
    ]

    const { nodes } = buildWorkflowGraphNodes('inbound_lead', stepRows, 'horizontal')

    const ids = nodes.map((n) => n.nodeId)
    expect(ids[ids.length - 2]).toBe('future_step')
    expect(ids[ids.length - 1]).toBe('another_unknown')
    expect(nodes.find((n) => n.nodeId === 'future_step')?.label).toBe('future_step')
    expect(nodes.find((n) => n.nodeId === 'another_unknown')?.status).toBe('failed')
  })

  it('falls back to seq-ordered steps for unknown workflow_key', () => {
    const stepRows = [
      makeStep('beta', 2, 'skipped'),
      makeStep('alpha', 1, 'succeeded'),
      makeStep('gamma', 3, 'failed'),
    ]

    const { nodes } = buildWorkflowGraphNodes('unknown_workflow', stepRows, 'vertical')

    expect(nodes.map((n) => n.nodeId)).toEqual(['alpha', 'beta', 'gamma'])
    expect(nodes[1].status).toBe('skipped')
    expect(nodes[2].status).toBe('failed')
    expect(nodes[0].position).toEqual({ x: 0, y: 0 })
    expect(nodes[1].position).toEqual({ x: 0, y: 120 })
  })

  it('builds linear edges between consecutive nodes', () => {
    const stepRows = [makeStep('insert_lead', 1, 'succeeded'), makeStep('created_event', 2, 'succeeded')]

    const { edges } = buildWorkflowGraphNodes('inbound_lead', stepRows, 'horizontal')

    expect(edges.some((e) => e.source === 'insert_lead' && e.target === 'created_event')).toBe(true)
  })

  it('renders extract as skipped for missed-call style runs', () => {
    const stepRows = INBOUND_LEAD_STEP_IDS.map((id, index) =>
      makeStep(id, index + 1, id === 'extract' ? 'skipped' : 'succeeded')
    )

    const { nodes } = buildWorkflowGraphNodes('inbound_lead', stepRows, 'horizontal')

    expect(nodes.find((n) => n.nodeId === 'extract')?.status).toBe('skipped')
    expect(nodes.find((n) => n.nodeId === 'extract')?.status).not.toBe('failed')
  })
})
