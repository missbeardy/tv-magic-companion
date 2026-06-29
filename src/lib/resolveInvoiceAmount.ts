export interface InvoiceLineItem {
  label: string
  amount: number
}

/** Prefill amount: accepted quote → calendar job_quote → null (manual entry). */
export function resolveInvoiceAmountFromSources(sources: {
  acceptedQuoteAmount: number | null | undefined
  eventJobQuote: number | null | undefined
}): number | null {
  if (typeof sources.acceptedQuoteAmount === 'number' && sources.acceptedQuoteAmount >= 0) {
    return sources.acceptedQuoteAmount
  }
  if (typeof sources.eventJobQuote === 'number' && sources.eventJobQuote >= 0) {
    return sources.eventJobQuote
  }
  return null
}

export function formatInvoiceNumber(seq: number, year = new Date().getFullYear()): string {
  return `INV-${year}-${String(seq).padStart(4, '0')}`
}

export function buildLineItemsHtml(items: InvoiceLineItem[]): string {
  if (!items.length) return ''
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(item.label)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;text-align:right">AUD ${item.amount.toFixed(2)}</td></tr>`
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px"><tbody>${rows}</tbody></table>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatDueDate(daysFromNow = 14): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}
