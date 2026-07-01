import { useState, type FormEvent } from 'react'
import { logLeadEvent } from '../lib/leadEvents'

interface Props {
  leadId: string
  orgId: string
  actorId: string
  onSaved?: () => void
}

export default function LeadContactNote({ leadId, orgId, actorId, onSaved }: Props) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    const trimmed = note.trim()
    if (!trimmed) return

    setSaving(true)
    setError('')
    const { error: logError } = await logLeadEvent({
      leadId,
      orgId,
      eventType: 'contact_note',
      note: trimmed,
      actorId,
    })
    setSaving(false)

    if (logError) {
      setError('Could not save note')
      return
    }

    setNote('')
    onSaved?.()
  }

  return (
    <form
      onSubmit={handleSave}
      onClick={(e) => e.stopPropagation()}
      className="rounded-lg border border-amber-100 bg-amber-50/50 p-2 space-y-2"
    >
      <label className="block text-xs font-medium text-amber-900" htmlFor={`contact-note-${leadId}`}>
        Contact note
      </label>
      <textarea
        id={`contact-note-${leadId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="What happened on this attempt?"
        className="w-full text-sm rounded-md border border-amber-200 bg-white px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving || !note.trim()}
        className="text-xs font-medium px-2.5 py-1 rounded-md bg-amber-700 text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save note'}
      </button>
    </form>
  )
}
