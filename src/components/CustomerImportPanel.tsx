import { useMemo, useState } from 'react'
import { getAuthHeaders } from '../lib/apiAuth'
import { fetchWithTimeout } from '../lib/fetchWithTimeout'
import { useOrg } from '../context/OrgContext'
import { Upload } from 'lucide-react'

type ColumnKey = 'name' | 'phone' | 'email' | 'address' | 'notes' | 'skip'

const COLUMN_OPTIONS: { value: ColumnKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'address', label: 'Address' },
  { value: 'notes', label: 'Notes' },
  { value: 'skip', label: 'Skip' },
]

interface ImportReport {
  created: number
  merged: number
  skipped: number
  errors: string[]
  total: number
}

function parseCsvPreview(text: string): string[][] {
  const normalised = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return normalised
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .slice(0, 6)
    .map((line) => {
      const cells: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') {
            current += '"'
            i++
          } else if (ch === '"') inQuotes = false
          else current += ch
        } else if (ch === '"') inQuotes = true
        else if (ch === ',') {
          cells.push(current.trim())
          current = ''
        } else current += ch
      }
      cells.push(current.trim())
      return cells
    })
}

function guessMap(headers: string[]): ColumnKey[] {
  const aliases: Record<string, ColumnKey> = {
    name: 'name',
    customer: 'name',
    'customer name': 'name',
    phone: 'phone',
    mobile: 'phone',
    email: 'email',
    address: 'address',
    notes: 'notes',
  }
  return headers.map((h) => aliases[h.trim().toLowerCase()] ?? 'skip')
}

export default function CustomerImportPanel() {
  const { isFeatureEnabled, featureSwitchesLoading } = useOrg()
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [columnMap, setColumnMap] = useState<ColumnKey[]>([])
  const [hasHeader, setHasHeader] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<ImportReport | null>(null)

  const preview = useMemo(() => (csvText ? parseCsvPreview(csvText) : []), [csvText])

  if (featureSwitchesLoading || !isFeatureEnabled('customer_import')) return null

  async function onFile(file: File) {
    setError('')
    setReport(null)
    const text = await file.text()
    setCsvText(text)
    setFileName(file.name)
    const rows = parseCsvPreview(text)
    setColumnMap(guessMap(rows[0] ?? []))
  }

  async function runImport() {
    setImporting(true)
    setError('')
    setReport(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetchWithTimeout('/api/leads?action=customer-import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ csvText, columnMap, hasHeader }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        report?: ImportReport
      }
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      setReport(data.report ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Upload size={18} className="text-gray-600" />
        <p className="text-sm font-semibold text-gray-700">Customer CSV import</p>
      </div>
      <p className="text-xs text-gray-500">
        Upload name, phone, email, address, notes. Duplicates merge by phone (then email). Cap 5,000 rows.
      </p>

      <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
        Choose CSV
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
          }}
        />
      </label>
      {fileName && <p className="text-xs text-gray-500">{fileName}</p>}

      {preview.length > 0 && (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
            />
            First row is a header
          </label>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  {(preview[0] ?? []).map((_, i) => (
                    <th key={i} className="p-2 border-b text-left font-medium">
                      <select
                        value={columnMap[i] ?? 'skip'}
                        onChange={(e) => {
                          const next = [...columnMap]
                          next[i] = e.target.value as ColumnKey
                          setColumnMap(next)
                        }}
                        className="border border-gray-200 rounded px-1 py-0.5"
                      >
                        {COLUMN_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(hasHeader ? 1 : 0).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="p-2 border-b text-gray-600 max-w-[140px] truncate">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={importing || !csvText}
            onClick={() => void runImport()}
            className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import customers'}
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {report && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-900 space-y-1">
          <p>
            Done — created {report.created}, merged {report.merged}, skipped {report.skipped} of{' '}
            {report.total}.
          </p>
          {report.errors.length > 0 && (
            <ul className="text-xs text-amber-800 list-disc pl-4">
              {report.errors.slice(0, 10).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
