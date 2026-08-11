// src/components/TeamExclusionsModal.tsx
// Edit a team member's job exclusions (T1.14) — "this person cannot do X".
import { useState } from 'react'
import { requireAuthHeaders } from '../lib/apiAuth'
import { normaliseKeyword } from '../../shared/serviceExclusions'
import { X, Ban, Plus, Save } from 'lucide-react'

interface Props {
  profileId: string
  fullName: string
  initialKeywords: string[]
  onClose: () => void
  onSaved: (keywords: string[]) => void
}

const MAX_KEYWORDS = 20

export default function TeamExclusionsModal({
  profileId,
  fullName,
  initialKeywords,
  onClose,
  onSaved,
}: Props) {
  const [keywords, setKeywords] = useState<string[]>(initialKeywords)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addKeyword() {
    const keyword = normaliseKeyword(draft)
    if (!keyword) return
    if (keywords.includes(keyword)) {
      setDraft('')
      return
    }
    if (keywords.length >= MAX_KEYWORDS) {
      setError(`Up to ${MAX_KEYWORDS} exclusions per person.`)
      return
    }
    setKeywords([...keywords, keyword])
    setDraft('')
    setError('')
  }

  function removeKeyword(keyword: string) {
    setKeywords(keywords.filter((k) => k !== keyword))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const headers = await requireAuthHeaders()
      const res = await fetch('/api/create-user?action=set-exclusions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ profileId, keywords }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save job exclusions')
      }
      onSaved(data.keywords ?? keywords)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <Ban size={15} className="text-red-500" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-gray-900 text-base">Job Exclusions</h3>
              <p className="text-sm text-gray-500 mt-0.5">{fullName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <p className="text-xs text-gray-500 leading-relaxed">
            Auto-assign will skip {fullName.split(' ')[0]} when one of these words appears in the
            customer's enquiry. Matching is on the customer's own wording, so add each way they
            might phrase it — <span className="font-medium text-gray-600">starlink</span> and{' '}
            <span className="font-medium text-gray-600">star link</span> are separate entries.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Cannot do
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addKeyword()
                  }
                }}
                placeholder="e.g. starlink"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
              />
              <button
                type="button"
                onClick={addKeyword}
                disabled={!draft.trim()}
                className="px-3.5 min-h-[44px] rounded-xl bg-[#004B93] text-white hover:bg-[#003d7a] transition-colors disabled:opacity-40"
                aria-label="Add exclusion"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 min-h-[2rem]">
            {keywords.length === 0 && (
              <p className="text-sm text-gray-400">
                No exclusions — {fullName.split(' ')[0]} can be assigned any job.
              </p>
            )}
            {keywords.map((keyword) => (
              <span
                key={keyword}
                className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-sm font-medium"
              >
                {keyword}
                <button
                  type="button"
                  onClick={() => removeKeyword(keyword)}
                  className="p-0.5 rounded-full hover:bg-red-100 transition-colors"
                  aria-label={`Remove ${keyword}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#004B93] text-white text-sm font-semibold hover:bg-[#003d7a] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? 'Saving...' : <><Save size={14} /> Save</>}
          </button>
        </div>
      </div>
    </div>
  )
}
