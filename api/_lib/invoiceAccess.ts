const INVOICE_SEND_ROLES = ['manager', 'platform_admin', 'employee'] as const

/** True when the session role is allowed to send invoices from the completion checklist. */
export function canSendInvoice(role: string | null | undefined): boolean {
  return INVOICE_SEND_ROLES.includes(role as (typeof INVOICE_SEND_ROLES)[number])
}
