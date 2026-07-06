import { useCallback, useEffect, useMemo, useState } from 'react'
import { GitBranch, RefreshCw } from 'lucide-react'
import { WORKFLOWS } from '../../../shared/workflowRegistry'
import { formatWorkflowDuration, type WorkflowStepRow } from '../../../shared/workflowGraph'
import { supabase } from '../../lib/supabase'
import WorkflowRunGraph, { findGraphNode } from './WorkflowRunGraph'
import WorkflowRunStepDetail from './WorkflowRunStepDetail'
import { WorkflowRunStatusPill } from './WorkflowRunStatusPill'
import type { WorkflowRunDisplayStatus } from '../../lib/workflowStatusStyles'

const PAGE_SIZE = 25
const POLL_MS = 30_000

type DateRange = '24h' | '7d' | '30d'

interface WorkflowRunRow {
  id: string
  org_id: string
  workflow_key: string
  trigger_channel: string | null
  status: WorkflowRunDisplayStatus
  started_at: string
  finished_at: string | null
  orgs: { name: string } | null
}

function rangeStartIso(range: DateRange): string {
  const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function workflowLabel(key: string): string {
  const wf = WORKFLOWS[key as keyof typeof WORKFLOWS]
  return wf?.label ?? key
}

function useGraphLayout(): 'horizontal' | 'vertical' {
  const [layout, setLayout] = useState<'horizontal' | 'vertical'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
      ? 'horizontal'
      : 'vertical'
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => setLayout(mq.matches ? 'horizontal' : 'vertical')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return layout
}

export default function WorkflowRunsPanel() {
  const layout = useGraphLayout()
  const [runs, setRuns] = useState<WorkflowRunRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>('24h')
  const [orgFilter, setOrgFilter] = useState('')
  const [workflowFilter, setWorkflowFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [stepRows, setStepRows] = useState<WorkflowStepRow[]>([])
  const [stepsLoading, setStepsLoading] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const orgOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const run of runs) {
      if (run.org_id && run.orgs?.name) {
        map.set(run.org_id, run.orgs.name)
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [runs])

  const workflowOptions = useMemo(() => {
    const keys = new Set(runs.map((r) => r.workflow_key))
    return [...keys].sort()
  }, [runs])

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null

  const selectedGraphNode = useMemo(() => {
    if (!selectedRun || !selectedNodeId) return null
    return findGraphNode(selectedRun.workflow_key, stepRows, selectedNodeId, layout)
  }, [selectedRun, selectedNodeId, stepRows, layout])

  const loadRuns = useCallback(async () => {
    setLoading(true)
    setError('')

    let query = supabase
      .from('workflow_runs')
      .select(
        'id, org_id, workflow_key, trigger_channel, status, started_at, finished_at, orgs(name)',
        { count: 'exact' }
      )
      .gte('started_at', rangeStartIso(dateRange))
      .order('started_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (orgFilter) query = query.eq('org_id', orgFilter)
    if (workflowFilter) query = query.eq('workflow_key', workflowFilter)
    if (statusFilter) query = query.eq('status', statusFilter)

    const { data, error: queryError, count } = await query

    if (queryError) {
      setError(queryError.message)
      setRuns([])
      setTotalCount(0)
    } else {
      setRuns((data ?? []) as WorkflowRunRow[])
      setTotalCount(count ?? 0)
    }
    setLoading(false)
  }, [dateRange, orgFilter, workflowFilter, statusFilter, page])

  const loadSteps = useCallback(async (runId: string) => {
    setStepsLoading(true)
    const { data, error: queryError } = await supabase
      .from('workflow_run_steps')
      .select('*')
      .eq('run_id', runId)
      .order('seq', { ascending: true })

    if (queryError) {
      setError(queryError.message)
      setStepRows([])
    } else {
      setStepRows((data ?? []) as WorkflowStepRow[])
    }
    setStepsLoading(false)
  }, [])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadRuns()
        if (selectedRunId) void loadSteps(selectedRunId)
      }
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [loadRuns, loadSteps, selectedRunId])

  useEffect(() => {
    setPage(0)
  }, [dateRange, orgFilter, workflowFilter, statusFilter])

  function handleSelectRun(runId: string) {
    setSelectedRunId(runId)
    setSelectedNodeId(null)
    void loadSteps(runId)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Read-only trace of inbound workflow runs. List refreshes every 30 seconds while this tab is visible.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Date range</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Org</label>
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs min-w-[140px]"
          >
            <option value="">All orgs</option>
            {orgOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Workflow</label>
          <select
            value={workflowFilter}
            onChange={(e) => setWorkflowFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="">All workflows</option>
            {workflowOptions.map((key) => (
              <option key={key} value={key}>
                {workflowLabel(key)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="">All statuses</option>
            <option value="running">running</option>
            <option value="succeeded">succeeded</option>
            <option value="partial">partial</option>
            <option value="failed">failed</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void loadRuns()}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2 py-1.5"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading workflow runs…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-gray-400">No workflow runs in this range.</p>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Workflow</th>
                <th className="text-left px-3 py-2 font-semibold">Org</th>
                <th className="text-left px-3 py-2 font-semibold">Channel</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="text-left px-3 py-2 font-semibold">Started</th>
                <th className="text-left px-3 py-2 font-semibold">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => handleSelectRun(run.id)}
                  className={`cursor-pointer hover:bg-gray-50 ${selectedRunId === run.id ? 'bg-blue-50/60' : ''}`}
                >
                  <td className="px-3 py-2 font-medium text-gray-800">{workflowLabel(run.workflow_key)}</td>
                  <td className="px-3 py-2 text-gray-600">{run.orgs?.name ?? run.org_id}</td>
                  <td className="px-3 py-2 text-gray-500">{run.trigger_channel ?? '—'}</td>
                  <td className="px-3 py-2">
                    <WorkflowRunStatusPill status={run.status} />
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {new Date(run.started_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {formatWorkflowDuration(run.started_at, run.finished_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Page {page + 1} of {totalPages} ({totalCount} runs)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedRun && (
        <div className="space-y-3 pt-2 border-t border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
            <GitBranch size={16} />
            Run trace — {workflowLabel(selectedRun.workflow_key)}
          </h3>
          {stepsLoading ? (
            <p className="text-sm text-gray-400">Loading steps…</p>
          ) : (
            <>
              <WorkflowRunGraph
                workflowKey={selectedRun.workflow_key}
                stepRows={stepRows}
                layout={layout}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
              />
              <WorkflowRunStepDetail
                node={selectedGraphNode}
                onClose={() => setSelectedNodeId(null)}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
