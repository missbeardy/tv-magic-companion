import { useEffect, useState } from 'react'
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
      <div className={variant === 'sheet' ? 'space-y-2' : 'mt-1'} onClick={stop} onKeyDown={stop}>
        <AddressAutocomplete
          value={draft}
          onChange={setDraft}
          onClick={stop}
          onKeyDown={stop}
          className={
            variant === 'sheet'
              ? 'w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]'
              : 'w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#004B93]'
          }
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={(e) => { stop(e); handleSave() }}
            disabled={saving}
            className="text-xs px-2 py-1 rounded-lg bg-[#004B93] text-white hover:bg-[#003d7a] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={(e) => { stop(e); handleCancel() }}
            disabled={saving}
            className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  if (!address?.trim()) {
    return (
      <button
        type="button"
        onClick={(e) => { stop(e); setEditing(true) }}
        className={`text-xs text-[#004B93] underline mt-1 ${variant === 'sheet' ? 'block w-full text-left py-1' : ''}`}
      >
        Add address
      </button>
    )
  }

  return (
    <div className={variant === 'sheet' ? 'space-y-2' : 'mt-1'} onClick={stop} onKeyDown={stop}>
      <div className={`flex items-start gap-2 ${variant === 'sheet' ? 'flex-col' : ''}`}>
        <button
          type="button"
          onClick={(e) => {
            stop(e)
            openNavigation(address)
          }}
          className={`text-xs text-[#00B4C5] underline flex items-center gap-1 text-left ${
            variant === 'sheet' ? 'w-full py-3 rounded-xl bg-gray-800 text-white font-semibold text-base justify-center no-underline' : ''
          }`}
        >
          {variant === 'sheet' ? '📍 Navigate to Job' : `📍 ${address}`}
        </button>
        {variant === 'card' && (
          <button
            type="button"
            onClick={(e) => { stop(e); setEditing(true) }}
            className="text-xs text-gray-500 hover:text-gray-700 shrink-0"
          >
            Edit
          </button>
        )}
      </div>
      {variant === 'sheet' && (
        <p className="text-sm text-gray-600">{address}</p>
      )}
      {variant === 'sheet' && (
        <button
          type="button"
          onClick={(e) => { stop(e); setEditing(true) }}
          className="text-sm text-[#004B93] underline"
        >
          Edit address
        </button>
      )}
    </div>
  )
}
