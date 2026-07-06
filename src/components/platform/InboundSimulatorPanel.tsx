import { useState } from 'react'
import { requireAuthHeaders } from '../../lib/apiAuth'
import { getPlatformUrl } from '../../lib/env'
import { PLATFORM_SIMULATE_INBOUND_URL } from '../../lib/platformSimulateInbound'

const UNROUTED_ORG_ID = '__unrouted__'

interface OrgOption {
  id: string
  name: string
}

type SimulateChannel = 'sms' | 'email' | 'voicemail' | 'facebook' | 'instagram'

interface SimulateResponse {
  simulated?: boolean
  unrouted?: boolean
  channel?: string
  orgId?: string | null
  orgName?: string | null
  leadId?: string | null
  unroutedCaptureId?: string | null
  handlerStatus?: number
  handlerResponse?: unknown
  handlerRaw?: string
  error?: string
}

const CHANNEL_OPTIONS: Array<{ value: SimulateChannel; label: string }> = [
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'facebook', label: 'Facebook Messenger' },
  { value: 'instagram', label: 'Instagram DM' },
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

  const unrouted = orgId === UNROUTED_ORG_ID
  const metaChannel = channel === 'facebook' || channel === 'instagram'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !text.trim()) return
    if (unrouted && metaChannel) return

    setSubmitting(true)
    setError('')
    setResult(null)

    try {
      const headers = await requireAuthHeaders()
      const res = await fetch(PLATFORM_SIMULATE_INBOUND_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ channel, orgId, text: text.trim() }),
      })
      const raw = await res.text()
      let data: SimulateResponse
      try {
        data = (raw ? JSON.parse(raw) : {}) as SimulateResponse
      } catch {
        throw new Error(
          raw.trim()
            ? `Simulator returned non-JSON (${res.status}). Use npm run dev:full or restart npm run dev after pulling latest.`
            : `Simulator returned an empty response (${res.status}). API routes need npm run dev:full, or restart vite if you already have the dev plugin. Check .env.local has INBOUND_SECRET and CLOUDMAILIN_INBOUND_BASE.`
        )
      }
      if (!res.ok) {
        const handlerNote =
          typeof data.handlerStatus === 'number' && data.handlerStatus !== res.status
            ? ` (inbound handler ${data.handlerStatus})`
            : ''
        setError(data.error || `Simulation failed (${res.status})${handlerNote}`)
        setResult(data)
      } else if (typeof data.handlerStatus === 'number' && data.handlerStatus >= 400) {
        setError(
          data.error ||
            `Inbound handler returned ${data.handlerStatus}. See raw handler response below.`
        )
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
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Fires a real request through the same HTTP endpoints Twilio and CloudMailin use. Leads are
        prefixed with <code className="text-[10px]">[SIMULATED TEST]</code> in the raw payload.
        Requires mapped phone numbers (SMS/voicemail) and inbound email tags per org — unless you
        choose <strong>Unrouted</strong> to test capture + platform alert.
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
              <option key={opt.value} value={opt.value} disabled={unrouted && (opt.value === 'facebook' || opt.value === 'instagram')}>
                {opt.label}
                {unrouted && (opt.value === 'facebook' || opt.value === 'instagram') ? ' (not for unrouted)' : ''}
              </option>
            ))}
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
            <option value={UNROUTED_ORG_ID}>Unrouted — no org mapping (capture test)</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {unrouted && (
            <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Uses deliberately unmapped routing (fake DID <code className="text-[10px]">+61999999999</code>{' '}
              or bare CloudMailin address). Expect no lead, one <code className="text-[10px]">unrouted_inbound</code>{' '}
              row, and an SMS to <code className="text-[10px]">PLATFORM_ALERT_PHONE</code>.
            </p>
          )}
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
          disabled={submitting || !orgId || (unrouted && metaChannel)}
          className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 w-fit"
        >
          {submitting ? 'Simulating…' : unrouted ? 'Simulate unrouted inbound' : 'Simulate inbound'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>
      )}

      {result && (
        <div className="space-y-3">
          {result.unrouted && result.unroutedCaptureId && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 rounded-xl">
              Captured in <code className="text-xs">unrouted_inbound</code>:{' '}
              <code className="text-xs">{result.unroutedCaptureId}</code>
              <p className="text-xs mt-1 text-amber-800">
                No lead created. Check your phone for the platform alert SMS.
              </p>
            </div>
          )}
          {result.unrouted && !result.unroutedCaptureId && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 rounded-xl">
              Handler returned OK but no recent <code className="text-xs">unrouted_inbound</code> row
              was found — check Vercel logs.
            </div>
          )}
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
    </div>
  )
}
