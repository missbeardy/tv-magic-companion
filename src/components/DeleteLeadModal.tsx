import { useState } from 'react'
import { X } from 'lucide-react'
import { getAuthHeaders } from '../lib/apiAuth'

const REASON_PRESETS = ['Duplicate lead', 'Spam', 'Test lead', 'Wrong details', 'Customer request'] as const

interface Props {
  leadId: string
  leadName: string
  onClose: () => void
  onDeleted: () => void
}

export default function DeleteLeadModal({ leadId, leadName, onClose, onDeleted }: Props) {
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const trimmedReason = reason.trim()
  const canSubmit = trimmedReason.length >= 3

  async function handleDelete() {
    setSaving(true)
    setError('')
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/leads?action=delete', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, reason: trimmedReason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Failed to remove lead')
        setSaving(false)
        return
      }
      onDeleted()
      onClose()
    } catch {
      setError('Failed to remove lead')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Remove lead</h3>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{leadName}</span> will be hidden from your team.
            The record is kept for audit purposes.
          </p>

          <div>
            <label htmlFor="delete-reason" className="block text-xs font-medium text-gray-500 mb-1">
              Reason (required)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              id="delete-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this lead being removed?"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit || saving}
              onClick={() => setConfirmOpen(true)}
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Removing…' : 'Remove lead'}
            </button>
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-4 max-w-sm w-full shadow-xl space-y-3">
            <p className="text-sm text-gray-800 font-medium">Confirm removal?</p>
            <p className="text-sm text-gray-500">{trimmedReason}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleDelete()}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                Yes, remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
