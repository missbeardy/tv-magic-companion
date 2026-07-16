import { useEffect, useState } from 'react'
import { useOrg } from '../../context/OrgContext'
import { fetchStripeConnectStatus } from '../../lib/stripeConnect'

export default function StripeConnectPanel() {
  const { org, refreshOrg } = useOrg()
  const [status, setStatus] = useState<'pending' | 'connected'>(
    org?.stripe_connect_status === 'connected' ? 'connected' : 'pending'
  )
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setStatus(org?.stripe_connect_status === 'connected' ? 'connected' : 'pending')
  }, [org?.stripe_connect_status])

  // Returning from Stripe onboarding — refresh status (safe: the Connect account
  // already exists at this point, so this is a status check, not a fresh creation).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('stripe_connect') !== 'return') return
    ;(async () => {
      try {
        const result = await fetchStripeConnectStatus()
        setStatus(result.connected ? 'connected' : 'pending')
        await refreshOrg()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh Stripe Connect status')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleConnect() {
    setConnecting(true)
    setError('')
    try {
      const result = await fetchStripeConnectStatus()
      if (result.connected) {
        setStatus('connected')
        await refreshOrg()
      } else if (result.url) {
        window.location.href = result.url
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Stripe Connect onboarding')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-700">💳 Card Payments (Stripe Connect)</p>
        <p className="text-xs text-gray-400 mt-1">
          Connect your own Stripe account to add a Pay Now button to invoice emails. You own the
          Stripe relationship — payouts and disputes go straight to your bank account.
        </p>
      </div>

      {status === 'connected' ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          ✓ Stripe connected — invoices sent from now on will include a Pay Now button.
        </p>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="px-4 py-2 text-sm bg-[#004B93] text-white rounded-lg hover:bg-[#003d7a] disabled:opacity-50 transition-colors"
        >
          {connecting ? 'Redirecting to Stripe…' : 'Connect Stripe'}
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
