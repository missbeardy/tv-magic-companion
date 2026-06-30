import { useEffect, useState } from 'react'
import { MapPin, Pencil } from 'lucide-react'
import AddressAutocomplete from './AddressAutocomplete'
import { updateLeadAddress } from '../lib/leadAddress'
import { openNavigation } from '../lib/navigation'

interface Props {
  leadId: string
  address?: string
  orgId: string
  actorId: string
  onSaved: () => void
  variant?: 'card' | 'sheet'
}

export default function LeadAddressEditor({
  leadId,
  address,
  orgId,
  actorId,
  onSaved,
  variant = 'card',
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(address ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft(address ?? '')
  }, [address])

  async function handleSave() {
    setSaving(true)
    setError('')
    const result = await updateLeadAddress(leadId, draft, orgId, actorId)
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
    setDraft(address ?? '')
    setEditing(false)
    setError('')
  }

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation()

  if (editing) {
    return (
      <div
        className={variant === 'sheet' ? 'space-y-2' : 'mt-1'}
        onClick={stop}
        onKeyDown={stop}
      >
        <AddressAutocomplete
          value={draft}
          onChange={setDraft}
          onClick={stop}
          onKeyDown={stop}
          className={
            variant === 'sheet'
              ? 'w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[var(--color-primary)]'
              : 'w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[var(--color-primary)]'
          }
        />
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

  if (variant === 'sheet') {
    return (
      <div
        className="rounded-lg bg-gray-50 border border-gray-100 p-3"
        onClick={stop}
        onKeyDown={stop}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">Address</p>
        {address?.trim() ? (
          <>
            <p className="text-sm text-gray-800 leading-snug">{address}</p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={(e) => { stop(e); openNavigation(address) }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-brand text-white text-sm font-medium"
              >
                <MapPin size={16} />
                Navigate
              </button>
              <button
                type="button"
                onClick={(e) => { stop(e); setEditing(true) }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                <Pencil size={15} />
                Edit
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={(e) => { stop(e); setEditing(true) }}
            className="w-full py-2.5 rounded-lg border border-dashed border-gray-300 bg-white text-sm font-medium text-[var(--color-primary)] hover:bg-gray-50"
          >
            + Add address
          </button>
        )}
      </div>
    )
  }

  if (!address?.trim()) {
    return (
      <button
        type="button"
        onClick={(e) => { stop(e); setEditing(true) }}
        className="text-xs text-[var(--color-primary)] underline mt-1"
      >
        Add address
      </button>
    )
  }

  return (
    <div className="mt-1 flex items-start gap-2" onClick={stop} onKeyDown={stop}>
      <button
        type="button"
        onClick={(e) => {
          stop(e)
          openNavigation(address)
        }}
        className="text-xs text-brand-secondary underline flex items-center gap-1 text-left min-w-0 flex-1"
      >
        <span className="shrink-0">📍</span>
        <span className="truncate">{address}</span>
      </button>
      <button
        type="button"
        onClick={(e) => { stop(e); setEditing(true) }}
        className="text-xs text-gray-500 hover:text-gray-700 shrink-0"
      >
        Edit
      </button>
    </div>
  )
}
