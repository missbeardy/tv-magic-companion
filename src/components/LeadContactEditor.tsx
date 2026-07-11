import { useEffect, useState } from 'react'
import { Phone, MessageSquare, Mail, Pencil } from 'lucide-react'
import { updateLeadContact } from '../lib/leadContact'

interface Props {
  lead: { id: string; name: string; phone?: string | null; email?: string | null }
  orgId: string
  actorId: string
  smsEnabled: boolean
  onCall: () => void
  onSms: () => void
  onSaved: () => void
}

export default function LeadContactEditor({
  lead,
  orgId,
  actorId,
  smsEnabled,
  onCall,
  onSms,
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(lead.name ?? '')
  const [phone, setPhone] = useState(lead.phone ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setName(lead.name ?? '')
    setPhone(lead.phone ?? '')
    setEmail(lead.email ?? '')
  }, [lead.name, lead.phone, lead.email])

  async function handleSave() {
    setSaving(true)
    setError('')
    const result = await updateLeadContact(lead.id, { name, phone, email }, orgId, actorId)
    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    setEditing(false)
    setSaving(false)
    onSaved()
  }

  function handleCancel() {
    setName(lead.name ?? '')
    setPhone(lead.phone ?? '')
    setEmail(lead.email ?? '')
    setEditing(false)
    setError('')
  }

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation()

  if (editing) {
    return (
      <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-2" onClick={stop} onKeyDown={stop}>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1 block">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1 block">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1 block">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={(e) => { stop(e); handleSave() }}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={(e) => { stop(e); handleCancel() }}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  const hasContact = lead.phone?.trim() || lead.email?.trim()

  if (!hasContact) {
    return (
      <div className="rounded-lg bg-gray-50 border border-gray-100 p-3" onClick={stop} onKeyDown={stop}>
        <button
          type="button"
          onClick={(e) => { stop(e); setEditing(true) }}
          className="w-full py-2.5 rounded-lg border border-dashed border-gray-300 bg-white text-sm font-medium text-[var(--color-primary)] hover:bg-gray-50"
        >
          + Add contact details
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-2" onClick={stop} onKeyDown={stop}>
      {lead.phone?.trim() && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-800 flex-1">{lead.phone}</span>
          <button
            type="button"
            onClick={(e) => { stop(e); onCall() }}
            className="p-2 rounded-lg text-[var(--color-primary)] hover:bg-white transition-colors"
            aria-label="Call"
          >
            <Phone size={18} />
          </button>
          {smsEnabled && (
            <button
              type="button"
              onClick={(e) => { stop(e); onSms() }}
              className="p-2 rounded-lg text-[var(--color-primary)] hover:bg-white transition-colors"
              aria-label="Send SMS"
            >
              <MessageSquare size={18} />
            </button>
          )}
        </div>
      )}
      {lead.email?.trim() && (
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-gray-400 shrink-0" />
          <a
            href={`mailto:${lead.email}`}
            onClick={stop}
            className="text-sm text-gray-800 truncate hover:text-[var(--color-primary)]"
          >
            {lead.email}
          </a>
        </div>
      )}
      <button
        type="button"
        onClick={(e) => { stop(e); setEditing(true) }}
        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50"
      >
        <Pencil size={15} />
        Edit
      </button>
    </div>
  )
}
