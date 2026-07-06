import { useState } from 'react'
import { Copy } from 'lucide-react'
import type { WorkflowGraphNode } from '../../../shared/workflowGraph'
import { formatWorkflowDuration } from '../../../shared/workflowGraph'
import { WorkflowStepStatusPill } from './WorkflowRunStatusPill'

interface WorkflowRunStepDetailProps {
  node: WorkflowGraphNode | null
  onClose: () => void
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '—'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function hasTruncatedMarker(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)._truncated === true
  )
}

export default function WorkflowRunStepDetail({ node, onClose }: WorkflowRunStepDetailProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  if (!node) return null

  const step = node.stepRow
  const outputTruncated = hasTruncatedMarker(step?.output)
  const errorTruncated = hasTruncatedMarker(step?.error)

  async function copyPayload() {
    const payload = {
      output: step?.output ?? null,
      error: step?.error ?? null,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('failed')
      setTimeout(() => setCopyState('idle'), 2000)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">{node.label}</h3>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{node.nodeId}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-800"
        >
          Close
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <WorkflowStepStatusPill status={node.status} />
        {step && (
          <>
            <span>Started: {new Date(step.started_at).toLocaleString()}</span>
            <span>Finished: {new Date(step.finished_at).toLocaleString()}</span>
            <span>Duration: {formatWorkflowDuration(step.started_at, step.finished_at)}</span>
          </>
        )}
        {!step && <span className="text-gray-400">Step not reached in this run</span>}
      </div>

      {(outputTruncated || errorTruncated) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-xl">
          Payload truncated at 2 KB in storage.
        </div>
      )}

      {step && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600">Output / error</p>
            <button
              type="button"
              onClick={copyPayload}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <Copy size={12} />
              {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy JSON'}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Output</p>
              <pre className="text-xs font-mono bg-gray-900 text-gray-100 rounded-xl p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                {prettyJson(step.output)}
              </pre>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Error</p>
              <pre className="text-xs font-mono bg-gray-900 text-gray-100 rounded-xl p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                {prettyJson(step.error)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
