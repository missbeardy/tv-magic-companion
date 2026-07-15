import { useEffect, useRef, useState } from 'react'
import { X, FileSignature } from 'lucide-react'
import { createQuote } from '../lib/quotes'
import { useAuth } from '../context/AuthContext'
import {
  clearQuoteDraft,
  loadQuoteDraft,
  quoteDraftHasContent,
  saveQuoteDraft,
} from '../lib/quoteDraft'
import { openDeviceSms } from '../lib/onTheWaySms'
import { formatAuPhoneForSms } from '../lib/phone'

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

function defaultScope(serviceType?: string | null) {
  return `Service: ${serviceType ?? 'General service'}\n\nIncludes:`
}

export default function QuoteComposerModal({ lead, onClose, onSent }: Props) {
  const { profile } = useAuth()
  const [scope, setScope] = useState(defaultScope(lead.service_type))
  const [terms, setTerms] = useState('Payment due on completion unless agreed otherwise.')
  const [totalAmount, setTotalAmount] = useState('180')
  const [expiryDays, setExpiryDays] = useState('7')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [acceptanceUrl, setAcceptanceUrl] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [deliveryMessage, setDeliveryMessage] = useState('')
  const [emailSent, setEmailSent] = useState<boolean | null>(null)
  const [smsSent, setSmsSent] = useState<boolean | null>(null)
  const draftRestoredRef = useRef(false)
  const skipDraftSaveRef = useRef(true)

  function handleClose() {
    if (profile?.id) clearQuoteDraft(profile.id)
    onClose()
  }

  useEffect(() => {
    if (!profile?.id || draftRestoredRef.current) return
    const draft = loadQuoteDraft(profile.id)
    if (!draft || draft.leadId !== lead.id || !quoteDraftHasContent(draft)) return
    draftRestoredRef.current = true
    setScope(draft.scope)
    setTerms(draft.terms)
    setTotalAmount(draft.totalAmount)
    setExpiryDays(draft.expiryDays)
    skipDraftSaveRef.current = false
  }, [profile?.id, lead.id])

  useEffect(() => {
    if (!profile?.id || skipDraftSaveRef.current || acceptanceUrl) {
      skipDraftSaveRef.current = false
      return
    }

    const draft = {
      leadId: lead.id,
      leadName: lead.name,
      leadPhone: lead.phone,
      leadEmail: lead.email,
      serviceType: lead.service_type,
      scope,
      terms,
      totalAmount,
      expiryDays,
    }

    if (!quoteDraftHasContent(draft)) {
      clearQuoteDraft(profile.id)
      return
    }

    const timer = window.setTimeout(() => {
      saveQuoteDraft(profile.id, draft)
    }, 500)

    return () => window.clearTimeout(timer)
  }, [
    profile?.id,
    lead.id,
    lead.name,
    lead.phone,
    lead.email,
    lead.service_type,
    scope,
    terms,
    totalAmount,
    expiryDays,
    acceptanceUrl,
  ])

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
      setSmsSent(quote.sms_sent === true)
      const parts = [quote.sms_message, quote.email_message].filter(Boolean)
      setDeliveryMessage(parts.join(' '))
      setCopyState('idle')
      if (profile?.id) clearQuoteDraft(profile.id)
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

  function handleOpenDeviceSms() {
    if (!lead.phone?.trim() || !acceptanceUrl) return
    const body = `Hi ${lead.name}, here's your quote: ${acceptanceUrl}`
    openDeviceSms(lead.phone, body)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center md:p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 md:px-6 py-4 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div>
            <h3 className="font-display font-semibold text-gray-900 text-base flex items-center gap-2">
              <FileSignature size={16} />
              Send Quote + E-Sign
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">{lead.name}</p>
            {lead.phone && (
              <p className="text-xs text-gray-400 mt-0.5">SMS to {formatAuPhoneForSms(lead.phone)}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 md:px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">{error}</div>
          )}

          {acceptanceUrl && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm">
              <p className="font-semibold text-emerald-700">Quote created.</p>
              {deliveryMessage && (
                <p
                  className={`mt-1 ${
                    smsSent || emailSent ? 'text-emerald-700/90' : 'text-amber-700'
                  }`}
                >
                  {deliveryMessage}
                </p>
              )}
              <p className="text-emerald-700/90 mt-1 break-all text-xs">{acceptanceUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
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
                  className="min-h-[44px] inline-flex items-center px-3 py-2 rounded-xl border border-emerald-300 text-emerald-700 text-sm font-semibold"
                >
                  Open
                </a>
                {smsSent === false && lead.phone?.trim() && (
                  <button
                    type="button"
                    onClick={handleOpenDeviceSms}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-sm font-semibold"
                  >
                    Open phone SMS
                  </button>
                )}
              </div>
            </div>
          )}

          {!acceptanceUrl && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Quote scope</label>
                <textarea
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  rows={5}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base md:text-sm min-h-[120px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Total incl. GST (AUD)
                  </label>
                  <input
                    type="number"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base md:text-sm min-h-[48px]"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Expiry (days)</label>
                  <input
                    type="number"
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base md:text-sm min-h-[48px]"
                    min="1"
                    max="30"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Terms</label>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base md:text-sm"
                />
              </div>
            </>
          )}
        </div>

        <div className="px-5 md:px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 border-t border-gray-100 flex gap-2 shrink-0">
          <button
            onClick={handleClose}
            disabled={sending}
            className="flex-1 min-h-[48px] py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          {!acceptanceUrl && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 min-h-[48px] py-3 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {sending ? 'Sending…' : lead.phone ? 'Send Quote SMS' : 'Send Quote'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
