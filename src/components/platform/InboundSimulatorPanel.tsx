import { useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { requireAuthHeaders } from '../../lib/apiAuth'
import { getPlatformUrl } from '../../lib/env'

interface OrgOption {
  id: string
  name: string
}

type SimulateChannel = 'sms' | 'email' | 'voicemail'

interface SimulateResponse {
  simulated?: boolean
  channel?: string
  orgId?: string
  orgName?: string
  leadId?: string | null
  handlerStatus?: number
  handlerResponse?: unknown
  handlerRaw?: string
  error?: string
}

const CHANNEL_OPTIONS: Array<{ value: SimulateChannel; label: string }> = [
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'voicemail', label: 'Voicemail' },
]

interface InboundSimulatorPanelProps {
  orgs: OrgOption[]
}

export default function InboundSimulatorPanel({ orgs }: InboundSimulatorPanelProps) {
  const [channel, setChannel] = useState<SimulateChannel>('sms')
  const [orgId, setOrgId] = useState('')
  const [text, setText] = useState('Customer needs a TV aerial installed at 12 Test St, Brisbane.')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SimulateResponse | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !text.trim()) return

    setSubmitting(true)
    setError('')
    setResult(null)

    try {
      const headers = await requireAuthHeaders()
      const res = await fetch('/api/platform-simulate-inbound', {
        method: 'POST',
        headers,
        body: JSON.stringify({ channel, orgId, text: text.trim() }),
      })
      const data = (await res.json()) as SimulateResponse
      if (!res.ok) {
        setError(data.error || `Simulation failed (${res.status})`)
        setResult(data)
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed')
    } finally {
      setSubmitting(false)
    }
  }

  const leadLink =
    result?.leadId && result.orgName
      ? `${getPlatformUrl()}/leads?highlight=${encodeURIComponent(result.leadId)}`
      : null

  return (
    <section className="card p-6 space-y-4">
      <h2 className="font-semibold text-gray-800 flex items-center gap-2">
        <FlaskConical size={18} /> Inbound pipeline simulator
      </h2>
      <p className="text-xs text-gray-500">
        Fires a real request through the same HTTP endpoints Twilio and CloudMailin use. Leads are
        prefixed with <code className="text-[10px]">[SIMULATED TEST]</code> in the raw payload.
        Requires mapped phone numbers (SMS/voicemail) and inbound email tags per org.
      </p>

      <form onSubmit={handleSubmit} className="grid gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as SimulateChannel)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            <option disabled>Facebook (coming soon)</option>
            <option disabled>WhatsApp (coming soon)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Target org</label>
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            required
          >
            <option value="" disabled>
              Select franchisee…
            </option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Payload text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
            placeholder="Describe the simulated enquiry…"
            required
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !orgId}
          className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 w-fit"
        >
          {submitting ? 'Simulating…' : 'Simulate inbound'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>
      )}

      {result && (
        <div className="space-y-3">
          {result.leadId && (
            <div className="bg-green-50 border border-green-200 text-green-800 text-sm p-3 rounded-xl">
              Lead created: <code className="text-xs">{result.leadId}</code>
              {result.orgName && <span className="ml-1">in {result.orgName}</span>}
              {leadLink && (
                <p className="mt-2 text-xs">
                  <a href={leadLink} className="underline font-medium" target="_blank" rel="noreferrer">
                    Open leads board (highlight)
                  </a>
                  <span className="text-green-700/80 ml-1">
                    — visible if your account can view that org&apos;s leads
                  </span>
                </p>
              )}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1">Raw handler response</p>
            <pre className="text-[11px] bg-gray-900 text-gray-100 rounded-xl p-3 overflow-x-auto max-h-64">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </section>
  )
}
