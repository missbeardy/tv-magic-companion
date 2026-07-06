import { useCallback, useMemo } from 'react'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  buildInboundTraceGraph,
  buildWorkflowGraphNodes,
  type WorkflowGraphLayout,
  type WorkflowGraphNode,
  type WorkflowStepRow,
} from '../../../shared/workflowGraph'
import type { KanbanPathNode } from '../../../shared/kanbanLifecycle'
import { stepNodeClass } from '../../lib/workflowStatusStyles'

export interface WorkflowGraphNodeData extends Record<string, unknown> {
  label: string
  status: WorkflowGraphNode['status']
  selected: boolean
  layout: WorkflowGraphLayout
  isCurrentKanban: boolean
  onSelect: (nodeId: string) => void
}

type WorkflowStepNodeType = Node<WorkflowGraphNodeData, 'workflowStep'>

function WorkflowStepNode({ id, data }: NodeProps<WorkflowStepNodeType>) {
  const targetPos = data.layout === 'vertical' ? Position.Top : Position.Left
  const sourcePos = data.layout === 'vertical' ? Position.Bottom : Position.Right

  return (
    <button
      type="button"
      className={stepNodeClass(data.status, data.selected, data.isCurrentKanban)}
      onClick={() => data.onSelect(id)}
    >
      <Handle type="target" position={targetPos} className="!bg-gray-300 !w-2 !h-2" />
      <span className="block leading-snug">{data.label}</span>
      <Handle type="source" position={sourcePos} className="!bg-gray-300 !w-2 !h-2" />
    </button>
  )
}

const nodeTypes = { workflowStep: WorkflowStepNode }

interface WorkflowRunGraphProps {
  workflowKey: string
  stepRows: WorkflowStepRow[]
  kanbanPath?: KanbanPathNode[]
  layout: WorkflowGraphLayout
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
}

export default function WorkflowRunGraph({
  workflowKey,
  stepRows,
  kanbanPath = [],
  layout,
  selectedNodeId,
  onSelectNode,
}: WorkflowRunGraphProps) {
  const graph = useMemo(() => {
    if (workflowKey === 'inbound_lead' && kanbanPath.length > 0) {
      return buildInboundTraceGraph(workflowKey, stepRows, kanbanPath, layout)
    }
    return buildWorkflowGraphNodes(workflowKey, stepRows, layout)
  }, [workflowKey, stepRows, kanbanPath, layout])

  const handleSelect = useCallback(
    (nodeId: string) => {
      onSelectNode(nodeId)
    },
    [onSelectNode]
  )

  const nodes: WorkflowStepNodeType[] = useMemo(
    () =>
      graph.nodes.map((node) => ({
        id: node.nodeId,
        type: 'workflowStep',
        position: node.position,
        data: {
          label: node.label,
          status: node.status,
          selected: selectedNodeId === node.nodeId,
          isCurrentKanban: node.isCurrentStatus === true,
          layout,
          onSelect: handleSelect,
        },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
      })),
    [graph.nodes, selectedNodeId, layout, handleSelect]
  )

  const edges = useMemo(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: false,
        selectable: false,
        focusable: false,
        style: edge.dashed ? { strokeDasharray: '6 4', stroke: '#94a3b8' } : undefined,
      })),
    [graph.edges]
  )

  if (nodes.length === 0) {
    return <p className="text-sm text-gray-400">No steps recorded for this run.</p>
  }

  return (
    <div
      className={`w-full border border-gray-100 rounded-xl overflow-hidden bg-gray-50 ${
        kanbanPath.length > 0 ? 'h-[360px] sm:h-[300px]' : 'h-[280px] sm:h-[220px]'
      }`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        panOnDrag
        zoomOnScroll
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="#e5e7eb" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export function findGraphNode(
  workflowKey: string,
  stepRows: WorkflowStepRow[],
  nodeId: string,
  layout: WorkflowGraphLayout = 'horizontal',
  kanbanPath: KanbanPathNode[] = []
): WorkflowGraphNode | null {
  const { nodes } =
    workflowKey === 'inbound_lead' && kanbanPath.length > 0
      ? buildInboundTraceGraph(workflowKey, stepRows, kanbanPath, layout)
      : buildWorkflowGraphNodes(workflowKey, stepRows, layout)
  return nodes.find((n) => n.nodeId === nodeId) ?? null
}
