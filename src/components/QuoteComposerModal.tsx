import { useState } from 'react'
import { X, FileSignature } from 'lucide-react'
import { createQuote } from '../lib/quotes'

interface LeadLite {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  service_type?: string | null
}

interface Props {
  lead: LeadLite
  onClose: () => void
  onSent?: () => void
}

export default function QuoteComposerModal({ lead, onClose, onSent }: Props) {
  const [scope, setScope] = useState(`Service: ${lead.service_type ?? 'General service'}\n\nIncludes:`)
  const [terms, setTerms] = useState('Payment due on completion unless agreed otherwise.')
  const [totalAmount, setTotalAmount] = useState('180')
  const [expiryDays, setExpiryDays] = useState('7')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [acceptanceUrl, setAcceptanceUrl] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [deliveryMessage, setDeliveryMessage] = useState('')
  const [emailSent, setEmailSent] = useState<boolean | null>(null)

  async function handleSend() {
    setError('')
    const amount = Number(totalAmount)
    const days = Number(expiryDays)
    if (!scope.trim()) {
      setError('Please add quote scope')
      return
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Quote amount must be a valid number')
      return
    }

    setSending(true)
    try {
      const { quote } = await createQuote({
        leadId: lead.id,
        customerName: lead.name,
        customerEmail: lead.email ?? null,
        customerPhone: lead.phone ?? null,
        serviceType: lead.service_type ?? null,
        scope,
        terms,
        totalAmount: amount,
        expiryDays: Number.isFinite(days) ? days : 7,
      })
      setAcceptanceUrl(quote.acceptance_url)
      setEmailSent(quote.email_sent === true)
      setDeliveryMessage(quote.email_message ?? '')
      setCopyState('idle')
      onSent?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send quote')
    } finally {
      setSending(false)
    }
  }

  async function handleCopyLink() {
    try {
      if (!acceptanceUrl) return
      await navigator.clipboard.writeText(acceptanceUrl)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1500)
    } catch {
      setCopyState('failed')
      setTimeout(() => setCopyState('idle'), 2000)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="font-display font-semibold text-gray-900 text-base flex items-center gap-2">
              <FileSignature size={16} />
              Send Quote + E-Sign
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">{lead.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">{error}</div>
          )}

          {acceptanceUrl && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm">
              <p className="font-semibold text-emerald-700">Quote sent successfully.</p>
              {deliveryMessage && (
                <p className={`mt-1 ${emailSent ? 'text-emerald-700/90' : 'text-amber-700'}`}>
                  {deliveryMessage}
                </p>
              )}
              <p className="text-emerald-700/90 mt-1 break-all">{acceptanceUrl}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                    copyState === 'copied'
                      ? 'border-emerald-500 bg-emerald-600 text-white'
                      : copyState === 'failed'
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-emerald-300 text-emerald-700'
                  }`}
                >
                  {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy link'}
                </button>
                <a
                  href={acceptanceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-700 text-xs font-semibold"
                >
                  Open
                </a>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Quote scope</label>
            <textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (AUD)</label>
              <input
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Expiry (days)</label>
              <input
                type="number"
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                min="1"
                max="30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Terms</label>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={sending}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Send Quote'}
          </button>
        </div>
      </div>
    </div>
  )
}
