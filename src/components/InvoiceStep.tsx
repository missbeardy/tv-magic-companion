import { useEffect, useState, type ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'
import { sendInvoiceEmail, type InvoiceLineItem } from '../lib/invoices'
import { resolveInvoiceAmountFromSources } from '../lib/resolveInvoiceAmount'
import type { ReviewRequestLead } from '../lib/reviewRequest'

interface Props {
  lead: ReviewRequestLead & {
    email?: string | null
    service_type?: string | null
  }
  onDone: (result: { sent: boolean; error?: string }) => void | Promise<void>
  onCancel: () => void
}

export default function InvoiceStep({ lead, onDone, onCancel }: Props) {
  const [amount, setAmount] = useState('')
  const [customerEmail, setCustomerEmail] = useState(lead.email?.trim() ?? '')
  const [quoteId, setQuoteId] = useState<string | null>(null)
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [pdfFileName, setPdfFileName] = useState<string | null>(null)
  const [loadingAmount, setLoadingAmount] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadAmount() {
      setLoadingAmount(true)
      let acceptedQuoteAmount: number | null = null
      let acceptedQuoteId: string | null = null
      let eventJobQuote: number | null = null

      const { data: quote } = await supabase
        .from('quotes')
        .select('id, total_amount')
        .eq('lead_id', lead.id)
        .eq('status', 'accepted')
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (quote) {
        acceptedQuoteAmount = Number(quote.total_amount)
        acceptedQuoteId = quote.id
      }

      const { data: event } = await supabase
        .from('events')
        .select('job_quote')
        .eq('lead_id', lead.id)
        .not('job_quote', 'is', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (event?.job_quote != null) {
        eventJobQuote = Number(event.job_quote)
      }

      const resolved = resolveInvoiceAmountFromSources({ acceptedQuoteAmount, eventJobQuote })
      if (resolved != null) setAmount(String(resolved))
      if (acceptedQuoteId) setQuoteId(acceptedQuoteId)
      setLoadingAmount(false)
    }
    loadAmount()
  }, [lead.id])

  async function handlePerJobPdfUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const { data: profile } = await supabase.auth.getUser()
    const { data: prof } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', profile.user?.id ?? '')
      .maybeSingle()
    if (!prof?.org_id) {
      setError('Organisation not found')
      return
    }
    setUploadingPdf(true)
    setError('')
    try {
      const path = `${prof.org_id}/job-invoices/${lead.id}-${Date.now()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('org-invoice-templates')
        .upload(path, file, { upsert: false })
      if (uploadError) throw uploadError
      setPdfPath(path)
      setPdfFileName(file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF upload failed')
    } finally {
      setUploadingPdf(false)
      e.target.value = ''
    }
  }

  async function handleSend() {
    const total = Number(amount)
    if (!customerEmail.trim()) {
      setError('Customer email is required to send an invoice.')
      return
    }
    if (!Number.isFinite(total) || total < 0) {
      setError('Enter a valid invoice amount.')
      return
    }

    setSending(true)
    setError('')
    try {
      await sendInvoiceEmail({
        leadId: lead.id,
        quoteId,
        customerName: lead.name,
        customerEmail: customerEmail.trim(),
        serviceType: lead.service_type ?? null,
        totalAmount: total,
        lineItems: lineItems.filter((item) => item.label.trim()),
        pdfStoragePath: pdfPath,
      })
      await onDone({ sent: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send invoice'
      setError(message)
      setSending(false)
    }
  }

  async function handleSkip() {
    await onDone({ sent: false })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[#004B93]">Send Invoice</h2>
        <p className="text-xs text-gray-500 mt-1">
          Email a branded invoice to {lead.name}. Cash or EFTPOS on site? Tap skip below.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Amount (AUD)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={loadingAmount || sending}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder={loadingAmount ? 'Loading…' : '0.00'}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Customer email</label>
        <input
          type="email"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          disabled={sending}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="customer@example.com"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Optional line item label</label>
        <input
          type="text"
          value={lineItems[0]?.label ?? lead.service_type ?? ''}
          onChange={(e) =>
            setLineItems([{ label: e.target.value, amount: Number(amount) || 0 }])
          }
          disabled={sending}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="TV wall mount installation"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Optional job PDF</label>
        <div className="flex items-center gap-2">
          <label className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
            {uploadingPdf ? 'Uploading…' : 'Attach PDF'}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={sending || uploadingPdf}
              onChange={handlePerJobPdfUpload}
            />
          </label>
          {pdfFileName && <span className="text-xs text-gray-500 truncate">{pdfFileName}</span>}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || uploadingPdf}
          className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white font-semibold disabled:opacity-40"
        >
          {sending ? 'Sending…' : 'Send invoice'}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={sending}
          className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold"
        >
          Skip — paid offline / no invoice
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={sending}
          className="w-full py-2 text-sm text-gray-400"
        >
          Cancel completion
        </button>
      </div>
    </div>
  )
}
