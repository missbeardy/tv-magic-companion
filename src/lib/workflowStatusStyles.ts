export type WorkflowStepDisplayStatus = 'succeeded' | 'failed' | 'skipped' | 'unreached'
export type WorkflowRunDisplayStatus = 'running' | 'succeeded' | 'partial' | 'failed'

export function runStatusPillClass(status: WorkflowRunDisplayStatus): string {
  switch (status) {
    case 'running':
      return 'badge badge-blue'
    case 'succeeded':
      return 'badge badge-green'
    case 'partial':
      return 'badge badge-amber'
    case 'failed':
      return 'badge badge-red'
    default:
      return 'badge badge-grey'
  }
}

export function stepStatusPillClass(status: WorkflowStepDisplayStatus): string {
  switch (status) {
    case 'succeeded':
      return 'badge badge-green'
    case 'failed':
      return 'badge badge-red'
    case 'skipped':
      return 'badge badge-grey'
    case 'unreached':
      return 'badge badge-grey opacity-60'
    default:
      return 'badge badge-grey'
  }
}

export function stepNodeClass(status: WorkflowStepDisplayStatus, selected = false): string {
  const base =
    'rounded-xl border px-3 py-2 text-xs font-semibold text-center min-w-[120px] max-w-[160px] cursor-pointer transition-shadow'
  const ring = selected ? ' ring-2 ring-[var(--color-primary)] ring-offset-1' : ''

  switch (status) {
    case 'succeeded':
      return `${base} bg-green-50 border-green-200 text-green-800${ring}`
    case 'failed':
      return `${base} bg-red-50 border-red-200 text-red-800${ring}`
    case 'skipped':
      return `${base} bg-slate-50 border-slate-200 text-slate-600${ring}`
    case 'unreached':
      return `${base} bg-gray-100 border-gray-200 text-gray-400 opacity-60${ring}`
    default:
      return `${base} bg-gray-50 border-gray-200 text-gray-600${ring}`
  }
}
