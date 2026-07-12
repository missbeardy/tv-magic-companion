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
      { id: 'link_customer', label: 'Link customer' },
      { id: 'notify_managers', label: 'Notify managers' },
      { id: 'follow_up_sms', label: 'Ack / hookback SMS' },
    ],
  },
  invoice_chase: {
    label: 'Invoice Chase',
    steps: [
      { id: 'load_invoice', label: 'Load overdue invoice' },
      { id: 'policy_check', label: 'Chase policy check' },
      { id: 'send_reminder', label: 'Send reminder (SMS/email)' },
      { id: 'record_chase', label: 'Record chase on invoice' },
    ],
  },
  quote_chase: {
    label: 'Quote Follow-Up',
    steps: [
      { id: 'load_quote', label: 'Load sent quote' },
      { id: 'policy_check', label: 'Follow-up policy check' },
      { id: 'send_follow_up', label: 'Send follow-up (SMS/email)' },
      { id: 'record_follow_up', label: 'Record follow-up on quote' },
    ],
  },
} as const

export type WorkflowKey = keyof typeof WORKFLOWS

export type InboundLeadStepId = (typeof WORKFLOWS.inbound_lead.steps)[number]['id']

/** Step ids recorded by processInboundLead — used for registry conformance tests. */
export const INBOUND_LEAD_STEP_IDS: readonly InboundLeadStepId[] =
  WORKFLOWS.inbound_lead.steps.map((s) => s.id)

export type InvoiceChaseStepId = (typeof WORKFLOWS.invoice_chase.steps)[number]['id']

export const INVOICE_CHASE_STEP_IDS: readonly InvoiceChaseStepId[] =
  WORKFLOWS.invoice_chase.steps.map((s) => s.id)

export type QuoteChaseStepId = (typeof WORKFLOWS.quote_chase.steps)[number]['id']

export const QUOTE_CHASE_STEP_IDS: readonly QuoteChaseStepId[] =
  WORKFLOWS.quote_chase.steps.map((s) => s.id)
