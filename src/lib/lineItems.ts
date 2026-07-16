export interface LineItem {
  label: string
  amount: number
}

/** Sum of line item amounts, rounded to cents. */
export function sumLineItems(items: LineItem[]): number {
  const total = items.reduce((acc, item) => acc + (Number(item.amount) || 0), 0)
  return Math.round(total * 100) / 100
}

/** Line items with a non-empty label, ready to send to the server. */
export function nonEmptyLineItems(items: LineItem[]): LineItem[] {
  return items.filter((item) => item.label.trim().length > 0)
}
