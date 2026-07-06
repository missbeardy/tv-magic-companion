export const WORKFLOWS = {
  inbound_lead: {
    label: 'Inbound Lead',
    steps: [
      { id: 'insert_lead', label: 'Save lead' },
      { id: 'created_event', label: 'Log created event' },
      { id: 'extract', label: 'AI extraction' },
      { id: 'apply_extraction', label: 'Apply extracted fields' },
      { id: 'after_extraction', label: 'Post-extraction update' },
      { id: 'fetch_saved_lead', label: 'Fetch saved lead' },
      { id: 'notify_managers', label: 'Notify managers' },
      { id: 'follow_up_sms', label: 'Ack / hookback SMS' },
    ],
  },
} as const

export type WorkflowKey = keyof typeof WORKFLOWS

export type InboundLeadStepId = (typeof WORKFLOWS.inbound_lead.steps)[number]['id']

/** Step ids recorded by processInboundLead — used for registry conformance tests. */
export const INBOUND_LEAD_STEP_IDS: readonly InboundLeadStepId[] =
  WORKFLOWS.inbound_lead.steps.map((s) => s.id)
