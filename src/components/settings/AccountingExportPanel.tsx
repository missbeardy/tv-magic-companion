import { useEffect, useState } from 'react'
import { Download, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useOrg } from '../../context/OrgContext'
import {
  buildXeroSalesCsv,
  defaultMonthRange,
  downloadCsv,
  endOfDayIso,
  startOfDayIso,
  type AccountingExportInvoice,
} from '../../lib/accountingExport'
import type { LineItem } from '../../lib/lineItems'

interface Props {
  orgId: string
}

function parseLineItems(raw: unknown): LineItem[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .filter((i): i is LineItem => i != null && typeof i === 'object' && 'label' in i)
    .map((i) => ({
      label: String((i as LineItem).label ?? ''),
      amount: Number((i as LineItem).amount) || 0,
    }))
}

export default function AccountingExportPanel({ orgId }: Props) {
  const { org, refreshOrg } = useOrg()
  const month = defaultMonthRange()
  const [from, setFrom] = useState(month.from)
  const [to, setTo] = useState(month.to)
  const [accountCode, setAccountCode] = useState(org?.accounting_account_code?.trim() || '200')
  const [exporting, setExporting] = useState(false)
  const [savingCode, setSavingCode] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setAccountCode(org?.accounting_account_code?.trim() || '200')
  }, [org?.accounting_account_code])

  async function handleSaveAccountCode() {
    setSavingCode(true)
    setError('')
    setMessage('')
    const code = accountCode.trim() || '200'
    const { error: saveError } = await supabase
      .from('orgs')
      .update({ accounting_account_code: code })
      .eq('id', orgId)

    if (saveError) {
      setError('Could not save account code.')
    } else {
      setAccountCode(code)
      setMessage('Account code saved.')
      await refreshOrg()
    }
    setSavingCode(false)
  }

  async function handleExport() {
    if (!from || !to) {
      setError('Choose a from and to date.')
      return
    }
    if (from > to) {
      setError('From date must be on or before to date.')
      return
    }

    setExporting(true)
    setError('')
    setMessage('')

    const { data, error: queryError } = await supabase
      .from('invoices')
      .select('customer_name, customer_email, invoice_number, sent_at, total_amount, line_items')
      .eq('org_id', orgId)
      .not('sent_at', 'is', null)
      .gte('sent_at', startOfDayIso(from))
      .lte('sent_at', endOfDayIso(to))
      .order('sent_at', { ascending: true })

    if (queryError) {
      setError('Could not load invoices for export.')
      setExporting(false)
      return
    }

    const invoices: AccountingExportInvoice[] = (data ?? [])
      .filter((row): row is typeof row & { sent_at: string } => Boolean(row.sent_at))
      .map((row) => ({
        customer_name: row.customer_name,
        customer_email: row.customer_email,
        invoice_number: row.invoice_number,
        sent_at: row.sent_at,
        total_amount: Number(row.total_amount) || 0,
        line_items: parseLineItems(row.line_items),
      }))

    if (invoices.length === 0) {
      setMessage('No sent invoices in that date range.')
      setExporting(false)
      return
    }

    const csv = buildXeroSalesCsv(invoices, {
      gstRegistered: org?.gst_registered !== false,
      accountCode: accountCode.trim() || '200',
    })
    downloadCsv(`xero-invoices-${from}-to-${to}.csv`, csv)
    setMessage(`Exported ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}.`)
    setExporting(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Accounting export</h2>
        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
          Download a Xero-compatible sales invoice CSV for a date range. Import in Xero using the{' '}
          <span className="font-medium text-gray-700">Tax Inclusive</span> option — amounts are
          gross (GST included when you are GST-registered). BSB/PayID instructions stay in Invoice
          templates.
        </p>
      </div>

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

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Xero AccountCode (default 200 — Sales)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            placeholder="200"
          />
          <button
            type="button"
            onClick={handleSaveAccountCode}
            disabled={savingCode}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {savingCode ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="inline-flex items-center gap-2 btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        {exporting ? 'Exporting…' : 'Export CSV'}
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {message && !error && <p className="text-xs text-green-700">{message}</p>}
    </div>
  )
}
