import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getPublicInvoice, type PublicInvoiceRecord } from '../lib/invoices'

function money(amount: number, currency = 'AUD') {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export default function InvoiceStatusPage() {
  const { token = '' } = useParams()
  const [searchParams] = useSearchParams()
  const justPaid = searchParams.get('paid') === '1'
  const [invoice, setInvoice] = useState<PublicInvoiceRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadInvoice() {
      setLoading(true)
      setError('')
      try {
        const inv = await getPublicInvoice(token)
        if (!cancelled) setInvoice(inv)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load invoice')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (token) loadInvoice()
    return () => {
      cancelled = true
    }
  }, [token])

  const isExpired = useMemo(() => {
    if (!invoice?.token_expires_at) return false
    return new Date(invoice.token_expires_at).getTime() < Date.now()
  }, [invoice?.token_expires_at])

  const primary = invoice?.primary_color?.trim() || '#004B93'
  const orgName = invoice?.org_name?.trim() || 'Invoice'
  const isPaid = invoice?.status === 'paid' || justPaid
  const canPayNow = Boolean(
    invoice && !isPaid && invoice.status === 'sent' && invoice.card_payments_enabled && !isExpired
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <p className="text-gray-500">Loading invoice…</p>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-6 text-center space-y-2">
          <h1 className="text-xl font-semibold text-gray-900">Invoice unavailable</h1>
          <p className="text-sm text-gray-500">{error || 'This invoice could not be found.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <main className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <header className="px-6 py-5 text-white" style={{ backgroundColor: primary }}>
          <div className="flex items-center gap-3">
            {invoice.logo_url ? (
              <img
                src={invoice.logo_url}
                alt=""
                className="h-10 w-10 rounded-lg object-cover bg-white/20"
              />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center text-sm font-bold">
                {orgName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-white/90">{orgName}</p>
              <h1 className="text-xl font-bold leading-tight">Invoice {invoice.invoice_number}</h1>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-5">
          {isPaid && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-sm">
              {justPaid && invoice.status !== 'paid'
                ? "Payment received — thanks! We're confirming this against the invoice now."
                : 'This invoice has been paid. Thank you!'}
            </div>
          )}
          {!isPaid && isExpired && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-xl text-sm">
              This payment link has expired — contact {orgName} to arrange payment.
            </div>
          )}
          {!isPaid && !isExpired && invoice.status === 'void' && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-xl text-sm">
              This invoice is no longer active.
            </div>
          )}

          <section className="rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-sm text-gray-500">Billed to</p>
            <p className="font-semibold text-gray-900">{invoice.customer_name}</p>
          </section>

          <section className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-gray-700">
                {invoice.gst_amount != null ? 'Total incl. GST' : 'Total'}
              </p>
              <p className="text-xl font-bold text-gray-900" style={{ color: primary }}>
                {money(Number(invoice.total_amount), invoice.currency)}
              </p>
            </div>
            {invoice.gst_amount != null && (
              <p className="text-xs text-gray-400 -mt-2">
                Includes GST of {money(Number(invoice.gst_amount), invoice.currency)}
              </p>
            )}
            {invoice.line_items && invoice.line_items.length > 0 && (
              <div className="border-t border-gray-100 pt-2 space-y-1">
                {invoice.line_items.map((item, index) => (
                  <div key={index} className="flex items-center justify-between gap-4 text-sm text-gray-600">
                    <span>{item.label}</span>
                    <span>{money(Number(item.amount), invoice.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {canPayNow && (
            <a
              href={`/api/stripe?action=invoice-pay&token=${encodeURIComponent(token)}`}
              className="block w-full text-center min-h-[48px] py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90"
              style={{ backgroundColor: primary }}
            >
              Pay Now
            </a>
          )}
        </div>
      </main>
    </div>
  )
}
