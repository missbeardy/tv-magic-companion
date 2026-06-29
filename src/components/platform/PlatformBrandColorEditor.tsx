import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  brandId: string
  brandName: string
  primaryColor: string
  secondaryColor: string
  onSaved: (primaryColor: string, secondaryColor: string) => void
}

function normalizeHexInput(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed}`
  return fallback
}

export default function PlatformBrandColorEditor({
  brandId,
  brandName,
  primaryColor,
  secondaryColor,
  onSaved,
}: Props) {
  const [primary, setPrimary] = useState(primaryColor)
  const [secondary, setSecondary] = useState(secondaryColor)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setPrimary(primaryColor)
    setSecondary(secondaryColor)
    setError('')
    setSaved(false)
  }, [brandId, primaryColor, secondaryColor])

  const dirty =
    normalizeHexInput(primary, primaryColor) !== normalizeHexInput(primaryColor, primaryColor) ||
    normalizeHexInput(secondary, secondaryColor) !== normalizeHexInput(secondaryColor, secondaryColor)

  async function handleSave() {
    const nextPrimary = normalizeHexInput(primary, primaryColor)
    const nextSecondary = normalizeHexInput(secondary, secondaryColor)
    setSaving(true)
    setError('')
    setSaved(false)

    const { error: saveError } = await supabase
      .from('brands')
      .update({
        primary_color: nextPrimary,
        secondary_color: nextSecondary,
      })
      .eq('id', brandId)

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }

    setPrimary(nextPrimary)
    setSecondary(nextSecondary)
    onSaved(nextPrimary, nextSecondary)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700">Brand template colours</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
          Saved to the <span className="font-medium">{brandName}</span> brand template — used for feature
          switch headers and copied to new franchisees. Franchise Settings only changes your org&apos;s copy
          (nav bar).
        </p>
      </div>

      <div className="flex gap-2 rounded-lg overflow-hidden h-9 border border-gray-200">
        <div className="flex-1" style={{ backgroundColor: normalizeHexInput(primary, primaryColor) }} />
        <div className="flex-1" style={{ backgroundColor: normalizeHexInput(secondary, secondaryColor) }} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Primary</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={normalizeHexInput(primary, primaryColor)}
              onChange={(e) => setPrimary(e.target.value)}
              className="w-9 h-9 rounded border border-gray-200 cursor-pointer shrink-0"
            />
            <input
              type="text"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Secondary</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={normalizeHexInput(secondary, secondaryColor)}
              onChange={(e) => setSecondary(e.target.value)}
              className="w-9 h-9 rounded border border-gray-200 cursor-pointer shrink-0"
            />
            <input
              type="text"
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-green-600">Brand template colours saved.</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !dirty}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save brand template colours'}
      </button>
    </div>
  )
}
