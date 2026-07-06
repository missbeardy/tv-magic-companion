import type { KanbanPathNode } from './kanbanLifecycle.js'
import { WORKFLOWS } from './workflowRegistry.js'

export type WorkflowStepRowStatus = 'succeeded' | 'failed' | 'skipped'
export type WorkflowGraphLane = 'inbound' | 'kanban'

export interface WorkflowStepRow {
  id: string
  run_id: string
  node_id: string
  seq: number
  status: WorkflowStepRowStatus
  output: Record<string, unknown> | null
  error: Record<string, unknown> | null
  started_at: string
  finished_at: string
}

export type WorkflowGraphNodeStatus = WorkflowStepRowStatus | 'unreached'

export type WorkflowGraphLayout = 'horizontal' | 'vertical'

export interface WorkflowGraphNode {
  nodeId: string
  label: string
  status: WorkflowGraphNodeStatus
  stepRow: WorkflowStepRow | null
  position: { x: number; y: number }
  lane?: WorkflowGraphLane
  leadEvent?: KanbanPathNode['event']
  isCurrentStatus?: boolean
  kanbanStatus?: string
}

export interface WorkflowGraphEdge {
  id: string
  source: string
  target: string
  dashed?: boolean
}

export interface WorkflowGraphResult {
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
}

const HORIZONTAL_GAP = 200
const VERTICAL_GAP = 120
const KANBAN_ROW_OFFSET_Y = 140
const KANBAN_ROW_OFFSET_X = 220
const BRIDGE_SOURCE_NODE_ID = 'follow_up_sms'

function stepStatusFromRow(row: WorkflowStepRow | undefined): WorkflowGraphNodeStatus {
  if (!row) return 'unreached'
  return row.status
}

function positionAt(index: number, layout: WorkflowGraphLayout): { x: number; y: number } {
  if (layout === 'horizontal') {
    return { x: index * HORIZONTAL_GAP, y: 0 }
  }
  return { x: 0, y: index * VERTICAL_GAP }
}

function buildEdges(nodeIds: string[]): WorkflowGraphEdge[] {
  const edges: WorkflowGraphEdge[] = []
  for (let i = 0; i < nodeIds.length - 1; i += 1) {
    const source = nodeIds[i]
    const target = nodeIds[i + 1]
    edges.push({ id: `${source}->${target}`, source, target })
  }
  return edges
}

function rowsByNodeId(stepRows: WorkflowStepRow[]): Map<string, WorkflowStepRow> {
  const map = new Map<string, WorkflowStepRow>()
  for (const row of stepRows) {
    if (!map.has(row.node_id)) {
      map.set(row.node_id, row)
    }
  }
  return map
}

/** Build ordered graph nodes from registry + run step rows. */
export function buildWorkflowGraphNodes(
  workflowKey: string,
  stepRows: WorkflowStepRow[],
  layout: WorkflowGraphLayout = 'horizontal'
): WorkflowGraphResult {
  const byNodeId = rowsByNodeId(stepRows)
  const ordered: Array<{ nodeId: string; label: string; stepRow: WorkflowStepRow | null }> = []

  const workflow = WORKFLOWS[workflowKey as keyof typeof WORKFLOWS]

  if (workflow) {
    const registryIds = new Set<string>()
    for (const step of workflow.steps) {
      registryIds.add(step.id)
      const row = byNodeId.get(step.id)
      ordered.push({
        nodeId: step.id,
        label: step.label,
        stepRow: row ?? null,
      })
    }

    const unknownRows = stepRows
      .filter((row) => !registryIds.has(row.node_id))
      .sort((a, b) => a.seq - b.seq)

    for (const row of unknownRows) {
      ordered.push({
        nodeId: row.node_id,
        label: row.node_id,
        stepRow: row,
      })
    }
  } else {
    const sorted = [...stepRows].sort((a, b) => a.seq - b.seq)
    for (const row of sorted) {
      ordered.push({
        nodeId: row.node_id,
        label: row.node_id,
        stepRow: row,
      })
    }
  }

  const nodes: WorkflowGraphNode[] = ordered.map((item, index) => ({
    nodeId: item.nodeId,
    label: item.label,
    status: stepStatusFromRow(item.stepRow ?? undefined),
    stepRow: item.stepRow,
    position: positionAt(index, layout),
  }))

  return {
    nodes,
    edges: buildEdges(nodes.map((n) => n.nodeId)),
  }
}

export function parseLeadIdFromTriggerSummary(summary: unknown): string | null {
  if (!summary || typeof summary !== 'object') return null
  const id = (summary as Record<string, unknown>).lead_id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/** Merge inbound workflow steps (row 1) with kanban lifecycle path (row 2). */
export function buildInboundTraceGraph(
  workflowKey: string,
  stepRows: WorkflowStepRow[],
  kanbanPath: KanbanPathNode[],
  layout: WorkflowGraphLayout = 'horizontal'
): WorkflowGraphResult {
  const inbound = buildWorkflowGraphNodes(workflowKey, stepRows, layout)
  const inboundNodes: WorkflowGraphNode[] = inbound.nodes.map((node) => ({
    ...node,
    lane: 'inbound' as const,
  }))

  if (kanbanPath.length === 0) {
    return { nodes: inboundNodes, edges: inbound.edges }
  }

  const kanbanNodes: WorkflowGraphNode[] = kanbanPath.map((item, index) => ({
    nodeId: item.nodeId,
    label: item.label,
    status: 'succeeded',
    stepRow: null,
    lane: 'kanban',
    leadEvent: item.event,
    isCurrentStatus: item.isCurrent,
    kanbanStatus: item.status,
    position:
      layout === 'horizontal'
        ? { x: index * HORIZONTAL_GAP, y: KANBAN_ROW_OFFSET_Y }
        : { x: KANBAN_ROW_OFFSET_X, y: index * VERTICAL_GAP },
  }))

  const edges: WorkflowGraphEdge[] = [...inbound.edges, ...buildEdges(kanbanPath.map((n) => n.nodeId))]

  const bridgeSource = inboundNodes.some((n) => n.nodeId === BRIDGE_SOURCE_NODE_ID)
    ? BRIDGE_SOURCE_NODE_ID
    : inboundNodes[inboundNodes.length - 1]?.nodeId

  if (bridgeSource && kanbanNodes[0]) {
    edges.push({
      id: `${bridgeSource}->${kanbanNodes[0].nodeId}`,
      source: bridgeSource,
      target: kanbanNodes[0].nodeId,
      dashed: true,
    })
  }

  return {
    nodes: [...inboundNodes, ...kanbanNodes],
    edges,
  }
}

export function formatWorkflowDuration(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined
): string {
  if (!startedAt) return '—'
  if (!finishedAt) return '—'
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`
}
