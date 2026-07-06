import { useState } from 'react'
import { Copy } from 'lucide-react'
import { buildCloudmailinPlusAddress } from '../../../shared/inboundEmailRouting'

interface OrgInboundRow {
  id: string
  name: string
  slug: string
  inbound_email_tag: string
}

interface InboundEmailRoutingPanelProps {
  orgs: OrgInboundRow[]
}

const CLOUDMAILIN_BASE =
  (import.meta.env.VITE_CLOUDMAILIN_INBOUND_BASE as string | undefined)?.trim() || ''

const FIELDBOURNE_INBOX =
  (import.meta.env.VITE_FIELDBOURNE_INBOUND_EMAIL as string | undefined)?.trim() ||
  'admin@fieldbourne.com.au'

export default function InboundEmailRoutingPanel({ orgs }: InboundEmailRoutingPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function copyAddress(orgId: string, address: string) {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedId(orgId)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setCopiedId(`failed-${orgId}`)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-600 space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p>
          <strong>Customer-facing:</strong> enquiries go to{' '}
          <code className="text-[10px] bg-white px-1 py-0.5 rounded">{FIELDBOURNE_INBOX}</code>{' '}
          (or org-specific addresses FieldBourne publishes in marketing).
        </p>
        <p>
          <strong>FieldBourne ops:</strong> configure automatic forward rules on the central mailbox —
          one rule per franchisee — to push matching enquiries to the CloudMailin plus-address below.
          Tradies do <em>not</em> set up Gmail forwards; this is platform-controlled infrastructure.
        </p>
        <p className="text-gray-500">
          Example (Microsoft 365): <em>When recipient contains &quot;South Brisbane&quot;</em> → forward to{' '}
          <code className="text-[10px] bg-white px-1 py-0.5 rounded">
            {CLOUDMAILIN_BASE
              ? buildCloudmailinPlusAddress(CLOUDMAILIN_BASE, 'org-tag')
              : '{base}+org-tag@cloudmailin.net'}
          </code>
          . Use the per-org address in the table when creating each rule.
        </p>
      </div>

      {!CLOUDMAILIN_BASE && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-xl">
          Set <code className="text-[10px]">VITE_CLOUDMAILIN_INBOUND_BASE</code> (e.g.{' '}
          <code className="text-[10px]">56465431321@cloudmailin.net</code>) in Vercel to show full forward
          addresses. Tags below still work for routing once server env is set.
        </div>
      )}

      <ul className="divide-y divide-gray-100 text-sm">
        {orgs.map((o) => {
          const forwardAddress = CLOUDMAILIN_BASE
            ? buildCloudmailinPlusAddress(CLOUDMAILIN_BASE, o.inbound_email_tag)
            : null
          return (
            <li key={o.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-medium">{o.name}</span>
                <span className="text-gray-400 ml-2 text-xs">tag: {o.inbound_email_tag}</span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                {forwardAddress ? (
                  <>
                    <code className="text-[11px] text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 truncate max-w-[280px] sm:max-w-md">
                      {forwardAddress}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyAddress(o.id, forwardAddress)}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 shrink-0"
                    >
                      <Copy size={12} />
                      {copiedId === o.id ? 'Copied' : copiedId === `failed-${o.id}` ? 'Failed' : 'Copy'}
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-gray-400">Plus-tag: {o.inbound_email_tag}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
