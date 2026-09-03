export const WORKFLOWS = {
  inbound_lead: {
    label: 'Inbound Lead',
    steps: [
      { id: 'insert_lead', label: 'Save lead' },
      { id: 'created_event', label: 'Log created event' },
      { id: 'extract', label: 'AI extraction' },
      { id: 'apply_extraction', label: 'Apply extracted fields' },
      { id: 'extraction_status', label: 'Set extraction status' },
      { id: 'after_extraction', label: 'Post-extraction update' },
      { id: 'fetch_saved_lead', label: 'Fetch saved lead' },
      { id: 'inbound_auto_assign_notify', label: 'Notify auto-assigned tech' },
      { id: 'link_customer', label: 'Link customer' },
      { id: 'notify_managers', label: 'Notify managers' },
      { id: 'follow_up_sms', label: 'Ack / hookback SMS' },
    ],
  },
  booking_reminder: {
    label: 'Booking Reminder',
    steps: [
      { id: 'load_event', label: 'Load booking' },
      { id: 'policy_check', label: 'Reminder policy check' },
      { id: 'send_reminder', label: 'Send reminder SMS' },
      { id: 'record_reminder', label: 'Record reminder on booking' },
    ],
  },
} as const

export type WorkflowKey = keyof typeof WORKFLOWS

export type InboundLeadStepId = (typeof WORKFLOWS.inbound_lead.steps)[number]['id']

/** Step ids recorded by processInboundLead — used for registry conformance tests. */
export const INBOUND_LEAD_STEP_IDS: readonly InboundLeadStepId[] =
  WORKFLOWS.inbound_lead.steps.map((s) => s.id)

export type BookingReminderStepId = (typeof WORKFLOWS.booking_reminder.steps)[number]['id']

export const BOOKING_REMINDER_STEP_IDS: readonly BookingReminderStepId[] =
  WORKFLOWS.booking_reminder.steps.map((s) => s.id)
