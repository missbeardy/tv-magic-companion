import { useEffect, useState } from 'react'
import { Link2, Link2Off, RefreshCw } from 'lucide-react'
import { useOrg } from '../../context/OrgContext'
import { defaultMonthRange } from '../../lib/accountingExport'
import {
  disconnectXero,
  fetchXeroStatus,
  startXeroOAuth,
  syncInvoicesToXero,
} from '../../lib/xeroConnect'

export default function XeroConnectPanel() {
  const { refreshOrg } = useOrg()
  const month = defaultMonthRange()
  const [connected, setConnected] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [mock, setMock] = useState(false)
  const [tenantName, setTenantName] = useState<string | null>(null)
  const [from, setFrom] = useState(month.from)
  const [to, setTo] = useState(month.to)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refreshStatus() {
    setLoading(true)
    setError('')
    try {
      const status = await fetchXeroStatus()
      setConnected(status.connected)
      setConfigured(status.configured)
      setMock(Boolean(status.mock))
      setTenantName(status.tenantName ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Xero status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshStatus()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const xero = params.get('xero')
    if (!xero) return
    if (xero === 'connected') {
      void refreshStatus().then(() => {
        setMessage('Connected.')
        return refreshOrg()
      })
    } else if (xero === 'error') {
      setError(params.get('message') || 'Xero connection failed')
    }
    params.delete('xero')
    params.delete('message')
    const next = params.toString()
    const url = `${window.location.pathname}${next ? `?${next}` : ''}`
    window.history.replaceState({}, '', url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleConnect() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { url } = await startXeroOAuth()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Xero connection')
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Xero? Tokens will be cleared; already-synced invoices keep their Xero IDs.')) {
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await disconnectXero()
      setConnected(false)
      setTenantName(null)
      setMessage('Xero disconnected.')
      await refreshOrg()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Xero')
    } finally {
      setBusy(false)
    }
  }

  async function handleSync() {
    if (!from || !to) {
      setError('Choose a from and to date.')
      return
    }
    if (from > to) {
      setError('From date must be on or before to date.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await syncInvoicesToXero(from, to)
      const errCount = result.errors.length
      setMessage(
        `${result.mock ? 'Mock sync: ' : ''}Synced ${result.synced} invoice${result.synced === 1 ? '' : 's'}` +
          (result.skipped ? `, skipped ${result.skipped}` : '') +
          (errCount ? `, ${errCount} failed` : '') +
          '.'
      )
      if (errCount > 0) {
        setError(result.errors.map((e) => `${e.invoice_number}: ${e.error}`).join(' · '))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xero sync failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Xero live sync</h2>
        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
          Connect your Xero organisation and push sent invoices (contacts + sales invoices, tax
          inclusive). Uses the AccountCode from Accounting export (default 200). Already-synced
          invoices are skipped. CSV export still works without connecting.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Checking connection…</p>
      ) : !configured ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Xero is not configured. Set{' '}
          <code className="text-xs">XERO_CLIENT_ID</code> /{' '}
          <code className="text-xs">XERO_CLIENT_SECRET</code>, or{' '}
          <code className="text-xs">XERO_MOCK=1</code> to test without a Xero account.
        </p>
      ) : connected ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Connected{tenantName ? ` to ${tenantName}` : ''}
          {mock ? ' — mock mode (nothing sent to Xero).' : '.'}
        </p>
      ) : (
        <p className="text-xs text-gray-500">
          Not connected.
          {mock ? ' Mock mode is on — Connect skips the real Xero login.' : ''}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!connected ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy || loading || !configured}
            className="inline-flex items-center gap-2 btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" />
            {busy ? 'Redirecting…' : 'Connect Xero'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Link2Off className="h-4 w-4" />
            Disconnect
          </button>
        )}
      </div>

      {connected && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Syncing…' : 'Sync invoices to Xero'}
          </button>
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {message && !error && <p className="text-xs text-green-700">{message}</p>}
      {message && error && <p className="text-xs text-amber-700">{message}</p>}
    </div>
  )
}
