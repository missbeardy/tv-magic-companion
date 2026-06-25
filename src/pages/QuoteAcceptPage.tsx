import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { acceptPublicQuote, getPublicQuote, type QuoteRecord } from '../lib/quotes'

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
  const [accepted, setAccepted] = useState(false)

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
      setQuote(updated)
      setAccepted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept quote')
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

  const locked = quote.status === 'accepted' || quote.status === 'declined' || isExpired || quote.status === 'expired'

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <main className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quote approval</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review your quote details and sign to accept.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">{error}</div>
        )}
        {(accepted || quote.status === 'accepted') && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm">
            Quote accepted. Thank you for signing.
          </div>
        )}
        {locked && quote.status !== 'accepted' && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-xl text-sm">
            This quote is no longer open for signing.
          </div>
        )}

        <section className="rounded-xl border border-gray-200 p-4 space-y-2">
          <p className="text-sm text-gray-500">Customer</p>
          <p className="font-semibold text-gray-900">{quote.customer_name}</p>
          <p className="text-sm text-gray-600">{quote.customer_email || quote.customer_phone || 'No contact provided'}</p>
          <p className="text-sm text-gray-600">{quote.service_type || 'Service quote'}</p>
        </section>

        <section className="rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-gray-700">Total</p>
            <p className="text-xl font-bold text-gray-900">{money(Number(quote.total_amount), quote.currency)}</p>
          </div>
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
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Email (optional)</label>
              <input
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                type="email"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Type your signature</label>
              <input
                value={signatureText}
                onChange={(e) => setSignatureText(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Type your full name as signature"
              />
            </div>
            <button
              type="button"
              onClick={handleAccept}
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Accept quote and sign'}
            </button>
          </section>
        )}
      </main>
    </div>
  )
}
