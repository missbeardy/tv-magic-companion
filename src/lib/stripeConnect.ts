import { requireAuthHeaders } from './apiAuth'

export interface StripeConnectStatus {
  connected: boolean
  status: 'pending' | 'connected'
  url?: string
}

export async function fetchStripeConnectStatus(): Promise<StripeConnectStatus> {
  const headers = await requireAuthHeaders()
  const res = await fetch('/api/stripe?action=connect-onboard', { method: 'POST', headers })
  const data = (await res.json().catch(() => ({}))) as StripeConnectStatus & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Failed to check Stripe Connect status')
  return data
}
