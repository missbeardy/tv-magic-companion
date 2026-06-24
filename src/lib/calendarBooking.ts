/** Customer name for calendar-created leads (title fallback when name field empty). */
export function resolveBookingCustomerName(clientName: string, title: string): string {
  return clientName.trim() || title.trim()
}

export function shouldCreateLeadFromBooking(
  linkedLeadId: string | null,
  clientName: string,
  title: string
): boolean {
  return !linkedLeadId && Boolean(resolveBookingCustomerName(clientName, title))
}
