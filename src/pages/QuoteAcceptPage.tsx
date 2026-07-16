import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  acceptPublicQuote,
  declinePublicQuote,
  getPublicQuote,
  type QuoteRecord,
} from '../lib/quotes'

function money(amount: number, currency = 'AUD') {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export default function QuoteAcceptPage() {
  const { token = '' } = useParams()
  const [quote, setQuote] = useState<QuoteRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [signatureText, setSignatureText] = useState('')
  const [declineReason, setDeclineReason] = useState('')
  const [showDecline, setShowDecline] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [declined, setDeclined] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadQuote() {
      setLoading(true)
      setError('')
      try {
        const q = await getPublicQuote(token)
        if (!cancelled) {
          setQuote(q)
          setSignerName(q.customer_name ?? '')
          setSignerEmail(q.customer_email ?? '')
          if (q.status === 'accepted') setAccepted(true)
          if (q.status === 'declined') setDeclined(true)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load quote')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (token) loadQuote()
    return () => {
      cancelled = true
    }
  }, [token])

  const isExpired = useMemo(() => {
    if (!quote?.token_expires_at) return false
    return new Date(quote.token_expires_at).getTime() < Date.now()
  }, [quote?.token_expires_at])

  const primary = quote?.primary_color?.trim() || '#004B93'
  const orgName = quote?.org_name?.trim() || 'Quote'

  async function handleAccept() {
    if (!token) return
    if (!signerName.trim() || !signatureText.trim()) {
      setError('Please provide your name and e-signature')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const updated = await acceptPublicQuote({
        token,
        signerName,
        signerEmail,
        signatureText,
      })
      setQuote((prev) => ({ ...updated, org_name: prev?.org_name, primary_color: prev?.primary_color, logo_url: prev?.logo_url }))
      setAccepted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept quote')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDecline() {
    if (!token) return
    setSubmitting(true)
    setError('')
    try {
      const updated = await declinePublicQuote({
        token,
        reason: declineReason.trim() || null,
      })
      setQuote((prev) => ({ ...updated, org_name: prev?.org_name, primary_color: prev?.primary_color, logo_url: prev?.logo_url }))
      setDeclined(true)
      setShowDecline(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline quote')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <p className="text-gray-500">Loading quote…</p>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-6 text-center space-y-2">
          <h1 className="text-xl font-semibold text-gray-900">Quote unavailable</h1>
          <p className="text-sm text-gray-500">{error || 'This quote could not be found.'}</p>
        </div>
      </div>
    )
  }

  const locked =
    quote.status === 'accepted' ||
    quote.status === 'declined' ||
    isExpired ||
    quote.status === 'expired' ||
    accepted ||
    declined

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <main className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <header
          className="px-6 py-5 text-white"
          style={{ backgroundColor: primary }}
        >
          <div className="flex items-center gap-3">
            {quote.logo_url ? (
              <img
                src={quote.logo_url}
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
              <h1 className="text-xl font-bold leading-tight">Quote approval</h1>
            </div>
          </div>
          <p className="text-sm text-white/85 mt-2">
            Review the details below and sign to accept.
            {quote.gst_amount != null ? ' Total incl. GST.' : ''}
          </p>
        </header>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">{error}</div>
          )}
          {(accepted || quote.status === 'accepted') && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-sm">
              Quote accepted. Thank you for signing — we&apos;ll be in touch to book your appointment.
            </div>
          )}
          {(declined || quote.status === 'declined') && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-sm">
              Quote declined. Thanks for letting us know.
            </div>
          )}
          {locked && quote.status !== 'accepted' && quote.status !== 'declined' && !accepted && !declined && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-xl text-sm">
              This quote is no longer open for signing.
            </div>
          )}

          <section className="rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-sm text-gray-500">Customer</p>
            <p className="font-semibold text-gray-900">{quote.customer_name}</p>
            <p className="text-sm text-gray-600">
              {quote.customer_email || quote.customer_phone || 'No contact provided'}
            </p>
            <p className="text-sm text-gray-600">{quote.service_type || 'Service quote'}</p>
          </section>

          <section className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-gray-700">
                {quote.gst_amount != null ? 'Total incl. GST' : 'Total'}
              </p>
              <p className="text-xl font-bold text-gray-900" style={{ color: primary }}>
                {money(Number(quote.total_amount), quote.currency)}
              </p>
            </div>
            {quote.gst_amount != null && (
              <p className="text-xs text-gray-400 -mt-2">
                Includes GST of {money(Number(quote.gst_amount), quote.currency)}
              </p>
            )}
            {quote.line_items && quote.line_items.length > 0 && (
              <div className="border-t border-gray-100 pt-2 space-y-1">
                {quote.line_items.map((item, index) => (
                  <div key={index} className="flex items-center justify-between gap-4 text-sm text-gray-600">
                    <span>{item.label}</span>
                    <span>{money(Number(item.amount), quote.currency)}</span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-700">Scope</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{quote.scope}</p>
            </div>
            {quote.terms && (
              <div>
                <p className="text-sm font-semibold text-gray-700">Terms</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{quote.terms}</p>
              </div>
            )}
            <p className="text-xs text-gray-400">
              Expires: {new Date(quote.token_expires_at).toLocaleString()}
            </p>
          </section>

          {!locked && (
            <section className="rounded-xl border border-gray-200 p-4 space-y-3">
              <h2 className="font-semibold text-gray-800">E-signature</h2>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Full name</label>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Email (optional)</label>
                <input
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base"
                  type="email"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Type your signature</label>
                <input
                  value={signatureText}
                  onChange={(e) => setSignatureText(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base"
                  placeholder="Type your full name as signature"
                />
              </div>
              <button
                type="button"
                onClick={handleAccept}
                disabled={submitting}
                className="w-full min-h-[48px] py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: primary }}
              >
                {submitting ? 'Submitting…' : 'Accept quote and sign'}
              </button>

              {!showDecline ? (
                <button
                  type="button"
                  onClick={() => setShowDecline(true)}
                  disabled={submitting}
                  className="w-full min-h-[44px] py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50"
                >
                  Decline quote
                </button>
              ) : (
                <div className="space-y-2 pt-1 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Reason (optional)
                  </label>
                  <textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="Timing, price, changed mind…"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDecline(false)}
                      className="flex-1 min-h-[44px] rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDecline}
                      disabled={submitting}
                      className="flex-1 min-h-[44px] rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-60"
                    >
                      {submitting ? 'Declining…' : 'Confirm decline'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
