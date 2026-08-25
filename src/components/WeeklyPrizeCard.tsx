// Manager-authored "up for grabs this week" spotlight on the leaderboard. Off by
// default (weekly_prizes.is_visible); the manager's own toggle here is the only gate —
// no platform-level feature switch, matching the leaderboard itself (dd19 decision).
import { useState, type ChangeEvent } from 'react'
import { Gift, ImagePlus, Loader2, Pencil, X } from 'lucide-react'
import { showToast } from '../lib/toast'
import { saveWeekPrize, uploadPrizePhoto, type WeeklyPrizeRow } from '../lib/weeklyPrize'

interface WeeklyPrizeCardProps {
  orgId: string
  weekStart: Date
  editorId: string
  prize: WeeklyPrizeRow | null
  canEdit: boolean
  primary: string
  onSaved: () => void
}

interface PrizeForm {
  title: string
  description: string
  photoUrl: string | null
  isVisible: boolean
}

function formFromPrize(prize: WeeklyPrizeRow | null): PrizeForm {
  return {
    title: prize?.title ?? '',
    description: prize?.description ?? '',
    photoUrl: prize?.photo_url ?? null,
    isVisible: prize?.is_visible ?? false,
  }
}

export default function WeeklyPrizeCard({
  orgId,
  weekStart,
  editorId,
  prize,
  canEdit,
  primary,
  onSaved,
}: WeeklyPrizeCardProps) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<PrizeForm>(() => formFromPrize(prize))
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setForm(formFromPrize(prize))
    setEditing(true)
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setUploading(true)
      const photoUrl = await uploadPrizePhoto(orgId, weekStart, file)
      setForm((current) => ({ ...current, photoUrl }))
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Could not upload the photo',
        variant: 'error',
      })
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!form.title.trim()) {
      showToast({ message: 'Give the prize a title', variant: 'error' })
      return
    }
    try {
      setSaving(true)
      await saveWeekPrize({
        orgId,
        weekStart,
        editorId,
        title: form.title.trim(),
        description: form.description.trim(),
        photoUrl: form.photoUrl,
        isVisible: form.isVisible,
      })
      setEditing(false)
      onSaved()
      showToast({ message: 'Prize saved', variant: 'success' })
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Could not save the prize',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <section className="card p-4 space-y-3" aria-label="Edit this week's prize">
        <div className="flex items-center justify-between">
          <p className="font-display font-bold text-gray-900 text-sm flex items-center gap-1.5">
            <Gift size={16} style={{ color: primary }} />
            Up for grabs this week
          </p>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 focus-brand"
            aria-label="Cancel editing"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label htmlFor="prize-title" className="text-xs font-semibold text-gray-500">
            Prize
          </label>
          <input
            id="prize-title"
            type="text"
            value={form.title}
            onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
            placeholder="e.g. $100 fuel voucher"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus-brand"
          />
        </div>

        <div>
          <label htmlFor="prize-description" className="text-xs font-semibold text-gray-500">
            Details (optional)
          </label>
          <textarea
            id="prize-description"
            value={form.description}
            onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
            placeholder="How the team wins it this week"
            rows={2}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus-brand resize-none"
          />
        </div>

        <div>
          <span className="text-xs font-semibold text-gray-500">Photo (optional)</span>
          <div className="mt-1 flex items-center gap-3">
            {form.photoUrl ? (
              <div className="relative shrink-0">
                <img
                  src={form.photoUrl}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => setForm((c) => ({ ...c, photoUrl: null }))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-500 flex items-center justify-center shadow-sm"
                  aria-label="Remove photo"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <label className="shrink-0 w-16 h-16 rounded-lg border border-dashed border-gray-300 text-gray-400 flex items-center justify-center cursor-pointer hover:bg-gray-50 focus-within:ring-2 focus-within:ring-offset-1">
                {uploading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <ImagePlus size={18} />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  disabled={uploading}
                  className="sr-only"
                />
              </label>
            )}
            <p className="text-xs text-gray-400">
              No photo? The prize text will fill the space instead.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-sm font-semibold text-gray-700">Show on the leaderboard</p>
            <p className="text-xs text-gray-500">
              {form.isVisible ? 'Visible to the whole team' : "Off — no one sees it yet"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForm((c) => ({ ...c, isVisible: !c.isVisible }))}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
              form.isVisible ? 'bg-[#004B93]' : 'bg-gray-300'
            }`}
            style={form.isVisible ? { backgroundColor: primary } : undefined}
            aria-label="Toggle prize visibility"
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                form.isVisible ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading}
          className="w-full py-2 rounded-lg text-sm font-semibold text-white focus-brand disabled:opacity-50"
          style={{ backgroundColor: primary }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </section>
    )
  }

  if (!prize?.is_visible) {
    if (!canEdit) return null
    return (
      <button
        type="button"
        onClick={startEditing}
        className="card w-full p-4 flex items-center justify-center gap-2 text-sm font-semibold text-gray-500 border-dashed focus-brand"
      >
        <Gift size={16} />
        Add a prize for this week
      </button>
    )
  }

  return (
    <section className="card p-4" aria-label="This week's prize">
      <div className={`flex gap-4 ${prize.photo_url ? 'items-center' : 'items-start'}`}>
        {prize.photo_url && (
          <img
            src={prize.photo_url}
            alt=""
            className="w-16 h-16 rounded-lg object-cover border border-gray-200 shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: primary }}>
            <Gift size={12} className="inline -mt-0.5 mr-1" />
            Up for grabs this week
          </p>
          <p className="font-display font-bold text-gray-900 truncate">{prize.title}</p>
          {prize.description && (
            <p className="text-sm text-gray-500 mt-0.5">{prize.description}</p>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={startEditing}
            className="shrink-0 p-2 rounded-lg text-gray-400 hover:bg-gray-100 focus-brand"
            aria-label="Edit this week's prize"
          >
            <Pencil size={15} />
          </button>
        )}
      </div>
    </section>
  )
}
