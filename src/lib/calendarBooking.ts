/** Customer name for calendar-created leads (title fallback when name field empty). */
export function resolveBookingCustomerName(clientName: string, title: string): string {
  return clientName.trim() || title.trim()
}

export function shouldCreateLeadFromBooking(
  linkedLeadId: string | null,
  clientName: string,
  _title: string
): boolean {
  // Title alone must not create a lead (e.g. manager team meetings).
  return !linkedLeadId && Boolean(clientName.trim())
}
