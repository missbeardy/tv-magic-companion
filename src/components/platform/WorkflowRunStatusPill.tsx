import {
  runStatusPillClass,
  stepStatusPillClass,
  type WorkflowRunDisplayStatus,
  type WorkflowStepDisplayStatus,
} from '../../lib/workflowStatusStyles'

interface WorkflowRunStatusPillProps {
  status: WorkflowRunDisplayStatus
}

export function WorkflowRunStatusPill({ status }: WorkflowRunStatusPillProps) {
  return <span className={runStatusPillClass(status)}>{status}</span>
}

interface WorkflowStepStatusPillProps {
  status: WorkflowStepDisplayStatus
}

export function WorkflowStepStatusPill({ status }: WorkflowStepStatusPillProps) {
  return <span className={stepStatusPillClass(status)}>{status}</span>
}
