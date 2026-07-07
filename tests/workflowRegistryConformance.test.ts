import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INBOUND_LEAD_STEP_IDS, INVOICE_CHASE_STEP_IDS, WORKFLOWS } from '../shared/workflowRegistry'

const PIPELINE_SOURCE = readFileSync(
  resolve(__dirname, '../api/_lib/processInboundLead.ts'),
  'utf8'
)

const INVOICE_CHASE_SOURCE = readFileSync(
  resolve(__dirname, '../api/_lib/invoiceChase.ts'),
  'utf8'
)

function recordedStepIds(source: string): string[] {
  const matches = source.matchAll(/recorder\.step\(\s*['"]([^'"]+)['"]/g)
  return [...new Set([...matches].map((m) => m[1]))].sort()
}

describe('workflow registry conformance', () => {
  it('every step recorded by processInboundLead exists in WORKFLOWS.inbound_lead.steps', () => {
    const registryIds = new Set(WORKFLOWS.inbound_lead.steps.map((s) => s.id))
    const pipelineIds = recordedStepIds(PIPELINE_SOURCE)

    for (const nodeId of pipelineIds) {
      expect(registryIds.has(nodeId as (typeof INBOUND_LEAD_STEP_IDS)[number])).toBe(true)
    }
  })

  it('registry lists every step id used by processInboundLead', () => {
    const pipelineIds = new Set(recordedStepIds(PIPELINE_SOURCE))
    for (const nodeId of INBOUND_LEAD_STEP_IDS) {
      expect(pipelineIds.has(nodeId)).toBe(true)
    }
  })

  it('every step recorded by invoiceChase exists in WORKFLOWS.invoice_chase.steps', () => {
    const registryIds = new Set(WORKFLOWS.invoice_chase.steps.map((s) => s.id))
    const pipelineIds = recordedStepIds(INVOICE_CHASE_SOURCE)

    for (const nodeId of pipelineIds) {
      expect(registryIds.has(nodeId as (typeof INVOICE_CHASE_STEP_IDS)[number])).toBe(true)
    }
  })

  it('registry lists every step id used by invoiceChase', () => {
    const pipelineIds = new Set(recordedStepIds(INVOICE_CHASE_SOURCE))
    for (const nodeId of INVOICE_CHASE_STEP_IDS) {
      expect(pipelineIds.has(nodeId)).toBe(true)
    }
  })
})
