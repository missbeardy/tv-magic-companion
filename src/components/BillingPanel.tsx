import { useState } from 'react'
import { CreditCard, ExternalLink, Sparkles } from 'lucide-react'
import { useOrg } from '../context/OrgContext'
import { isPlatformFeaturesEnabled } from '../lib/env'
import { requireAuthHeaders } from '../lib/apiAuth'
import { FEATURES, type FeatureKey } from '../lib/features'

const TIER_LABELS = {
  basic: 'Basic',
  pro: 'Pro',
  enterprise: 'Enterprise',
} as const

const TIER_FEATURES: Record<string, string[]> = {
  basic: ['Leads', 'Calendar'],
  pro: ['Everything in Basic', 'Tasks', 'Social', 'AI lead parsing', 'Reports'],
  enterprise: ['Everything in Pro', 'API access', 'Priority support'],
}

export default function BillingPanel() {
  const { org, refreshOrg } = useOrg()
  const [loading, setLoading] = useState<'pro' | 'enterprise' | 'portal' | null>(null)
  const [error, setError] = useState('')

  if (!isPlatformFeaturesEnabled() || !org) return null

  const tier = org.subscription_tier ?? 'basic'

  async function startCheckout(targetTier: 'pro' | 'enterprise') {
    setLoading(targetTier)
    setError('')
    try {
      const headers = await requireAuthHeaders()
      const res = await fetch('/api/stripe?action=checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tier: targetTier }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string }
      if (!res.ok) {
        throw new Error(data.error ?? `Checkout failed (${res.status})`)
      }
      if (data.url) {
        window.location.href = data.url
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setLoading(null)
    }
  }

  async function openPortal() {
    setLoading('portal')
    setError('')
    try {
      const headers = await requireAuthHeaders()
      const res = await fetch('/api/stripe?action=portal', {
        method: 'POST',
        headers,
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string }
      if (!res.ok) {
        throw new Error(data.error ?? `Portal failed (${res.status})`)
      }
      if (data.url) {
        window.location.href = data.url
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Portal failed')
      setLoading(null)
    }
  }

  const lockedFeatures = (Object.keys(FEATURES) as FeatureKey[]).filter((key) => {
    const required = FEATURES[key].tier
    const order = ['basic', 'pro', 'enterprise']
    return order.indexOf(tier) < order.indexOf(required)
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard size={18} className="text-gray-600" />
        <p className="text-sm font-semibold text-gray-700">Subscription & Billing</p>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Current plan</p>
          <p className="text-lg font-bold text-gray-800">{TIER_LABELS[tier]}</p>
        </div>
        <span className="badge badge-blue capitalize">{org.billing_status ?? 'manual'}</span>
      </div>

      <ul className="text-sm text-gray-600 space-y-1">
        {TIER_FEATURES[tier]?.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <Sparkles size={14} className="text-brand-secondary shrink-0" />
            {item}
          </li>
        ))}
      </ul>

      {lockedFeatures.length > 0 && (
        <p className="text-xs text-gray-400">
          Upgrade to unlock: {lockedFeatures.map((f) => FEATURES[f].label).join(', ')}
        </p>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="flex flex-col gap-2">
        {tier === 'basic' && (
          <button
            type="button"
            onClick={() => startCheckout('pro')}
            disabled={loading !== null}
            className="w-full btn-primary py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading === 'pro' ? 'Redirecting…' : 'Upgrade to Pro'}
          </button>
        )}
        {tier !== 'enterprise' && (
          <button
            type="button"
            onClick={() => startCheckout('enterprise')}
            disabled={loading !== null}
            className="w-full border border-gray-300 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading === 'enterprise' ? 'Redirecting…' : 'Upgrade to Enterprise'}
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            await refreshOrg()
            await openPortal()
          }}
          disabled={loading !== null}
          className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 py-1 disabled:opacity-50"
        >
          <ExternalLink size={14} />
          {loading === 'portal' ? 'Opening…' : 'Manage billing in Stripe'}
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Billing is per franchisee. Use Stripe test mode on preview until production cutover.
      </p>
    </div>
  )
}
