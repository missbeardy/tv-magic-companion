import '@testing-library/jest-dom/vitest'
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkflowRunsPanel from '../src/components/platform/WorkflowRunsPanel'
import { INBOUND_LEAD_STEP_IDS } from '../shared/workflowRegistry'

const RUN_ID = 'run-test-1'

const mockRun = {
  id: RUN_ID,
  org_id: 'org-1',
  workflow_key: 'inbound_lead',
  trigger_channel: 'sms',
  trigger_summary: { lead_id: 'lead-1' },
  status: 'partial',
  started_at: '2026-07-07T10:00:00.000Z',
  finished_at: '2026-07-07T10:00:05.000Z',
  orgs: { name: 'TV Magic Test Org' },
}

function makeSteps() {
  return INBOUND_LEAD_STEP_IDS.map((nodeId, index) => ({
    id: `step-${index}`,
    run_id: RUN_ID,
    node_id: nodeId,
    seq: index + 1,
    status: nodeId === 'extract' ? 'failed' : 'succeeded',
    output: nodeId === 'insert_lead' ? { lead_id: 'lead-1' } : null,
    error:
      nodeId === 'extract'
        ? { message: 'Extraction failed', _truncated: true }
        : null,
    started_at: '2026-07-07T10:00:01.000Z',
    finished_at: '2026-07-07T10:00:02.000Z',
  }))
}

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  ReactFlow: ({
    nodes,
  }: {
    nodes: Array<{ id: string; data: { label: string; onSelect: (id: string) => void } }>
  }) => (
    <div data-testid="workflow-graph">
      {nodes.map((node) => (
        <button key={node.id} type="button" onClick={() => node.data.onSelect(node.id)}>
          {node.data.label}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('../src/lib/supabase', () => {
  const runsQuery = {
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  }

  runsQuery.range = vi.fn().mockImplementation(() =>
    Promise.resolve({ data: [mockRun], error: null, count: 1 })
  )

  const stepsQuery = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockImplementation(() =>
      Promise.resolve({ data: makeSteps(), error: null })
    ),
  }

  const leadEventsQuery = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: 'evt-1',
            lead_id: 'lead-1',
            event_type: 'created',
            payload: null,
            note: null,
            created_at: '2026-07-07T10:00:01.000Z',
          },
        ],
        error: null,
      })
    ),
  }

  const leadsQuery = {
    in: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: [{ id: 'lead-1', name: 'Jane Doe', service_type: 'TV Aerial' }],
        error: null,
      })
    ),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(() =>
      Promise.resolve({ data: { status: 'unassigned' }, error: null })
    ),
  }

  const cronHeartbeatsQuery = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(() =>
      Promise.resolve({ data: { last_run_at: '2026-07-16T09:00:00.000Z' }, error: null })
    ),
  }

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'workflow_runs') {
          return {
            select: vi.fn(() => runsQuery),
          }
        }
        if (table === 'workflow_run_steps') {
          return {
            select: vi.fn(() => stepsQuery),
          }
        }
        if (table === 'lead_events') {
          return {
            select: vi.fn(() => leadEventsQuery),
          }
        }
        if (table === 'leads') {
          return {
            select: vi.fn(() => leadsQuery),
          }
        }
        if (table === 'cron_heartbeats') {
          return {
            select: vi.fn(() => cronHeartbeatsQuery),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    },
  }
})

describe('WorkflowRunsPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('768px'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    )
  })

  it('renders a run and shows failed extraction detail with truncated note', async () => {
    render(
      <MemoryRouter>
        <WorkflowRunsPanel />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: 'Inbound Lead' })).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /Jane Doe/ })).toHaveAttribute(
      'href',
      '/leads?highlight=lead-1'
    )

    fireEvent.click(screen.getByRole('cell', { name: 'Inbound Lead' }))

    await waitFor(() => {
      expect(screen.getByTestId('workflow-graph')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'AI extraction' }))

    await waitFor(() => {
      expect(screen.getByText('Payload truncated at 2 KB in storage.')).toBeInTheDocument()
    })

    expect(screen.getByText('failed', { selector: '.badge' })).toBeInTheDocument()
    expect(screen.getByText(/Extraction failed/)).toBeInTheDocument()
  })
})

/**
 * RLS manual check: as a non-platform_admin user, direct
 * supabase.from('workflow_runs').select() must return zero rows.
 */
