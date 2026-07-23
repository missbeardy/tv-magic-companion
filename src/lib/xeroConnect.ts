import { requireAuthHeaders } from './apiAuth'

export interface XeroStatusResult {
  connected: boolean
  configured: boolean
  mock?: boolean
  tenantName?: string | null
  connectedAt?: string | null
}

export interface XeroSyncResult {
  synced: number
  skipped: number
  total: number
  mock?: boolean
  errors: Array<{ invoice_number: string; error: string }>
}

export async function startXeroOAuth(): Promise<{ url: string }> {
  const headers = await requireAuthHeaders()
  const res = await fetch('/api/xero?action=oauth-start', {
    method: 'POST',
    headers,
  })
  const data = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Failed to start Xero connection')
  }
  return { url: data.url }
}

export async function fetchXeroStatus(): Promise<XeroStatusResult> {
  const headers = await requireAuthHeaders()
  const res = await fetch('/api/xero?action=status', {
    method: 'GET',
    headers,
  })
  const data = (await res.json()) as XeroStatusResult & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load Xero status')
  }
  return data
}

export async function syncInvoicesToXero(from: string, to: string): Promise<XeroSyncResult> {
  const headers = await requireAuthHeaders()
  const res = await fetch('/api/xero?action=sync', {
    method: 'POST',
    headers,
    body: JSON.stringify({ from, to }),
  })
  const data = (await res.json()) as XeroSyncResult & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || 'Xero sync failed')
  }
  return data
}

export async function disconnectXero(): Promise<void> {
  const headers = await requireAuthHeaders()
  const res = await fetch('/api/xero?action=disconnect', {
    method: 'POST',
    headers,
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) {
    throw new Error(data.error || 'Failed to disconnect Xero')
  }
}
