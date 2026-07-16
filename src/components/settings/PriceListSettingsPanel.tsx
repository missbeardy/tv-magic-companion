import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface PriceListDraft {
  id: string | null
  clientKey: string
  label: string
  amount: string
  active: boolean
  sort_order: number
}

interface Props {
  orgId: string
}

function makeClientKey() {
  return Math.random().toString(36).slice(2, 9)
}

export default function PriceListSettingsPanel({ orgId }: Props) {
  const [items, setItems] = useState<PriceListDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    if (!orgId) return
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('price_list_items')
      .select('id, label, amount, active, sort_order')
      .eq('org_id', orgId)
      .order('sort_order', { ascending: true })

    if (loadError) {
      setError('Could not load price list.')
    } else {
      setItems(
        (data ?? []).map((row) => ({
          id: row.id,
          clientKey: row.id,
          label: row.label,
          amount: String(row.amount),
          active: row.active,
          sort_order: row.sort_order,
        }))
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [orgId])

  function handleAdd() {
    setItems((prev) => [
      ...prev,
      { id: null, clientKey: makeClientKey(), label: '', amount: '', active: true, sort_order: prev.length },
    ])
  }

  function handleFieldChange(clientKey: string, patch: Partial<PriceListDraft>) {
    setItems((prev) => prev.map((item) => (item.clientKey === clientKey ? { ...item, ...patch } : item)))
  }

  async function handleDelete(item: PriceListDraft) {
    if (item.id) {
      const { error: deleteError } = await supabase.from('price_list_items').delete().eq('id', item.id)
      if (deleteError) {
        setError('Failed to delete item.')
        return
      }
    }
    setItems((prev) => prev.filter((i) => i.clientKey !== item.clientKey))
  }

  function handleMove(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((item, i) => ({ ...item, sort_order: i }))
    })
  }

  async function handleSave() {
    if (!orgId) return
    const valid = items.filter((item) => item.label.trim() && Number(item.amount) >= 0)
    if (valid.some((item) => !Number.isFinite(Number(item.amount)))) {
      setError('Every priced item needs a valid amount.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const inserts = valid
        .filter((item) => item.id === null)
        .map((item) => ({
          org_id: orgId,
          label: item.label.trim(),
          amount: Number(item.amount),
          active: item.active,
          sort_order: item.sort_order,
        }))
      const updates = valid.filter((item) => item.id !== null)

      if (inserts.length) {
        const { error: insertError } = await supabase.from('price_list_items').insert(inserts)
        if (insertError) throw insertError
      }
      for (const item of updates) {
        const { error: updateError } = await supabase
          .from('price_list_items')
          .update({
            label: item.label.trim(),
            amount: Number(item.amount),
            active: item.active,
            sort_order: item.sort_order,
          })
          .eq('id', item.id as string)
        if (updateError) throw updateError
      }

      await load()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save price list')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading price list…</p>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-700">💲 Price List / Favourites</p>
        <p className="text-xs text-gray-400 mt-1">
          Your 10–20 most common priced jobs. These show as quick-add chips when composing quotes and invoices.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-gray-400 italic">No price list items yet. Add one below.</p>
        )}
        {items.map((item, index) => (
          <div key={item.clientKey} className="flex items-center gap-1.5">
            <div className="flex flex-col shrink-0">
              <button
                type="button"
                onClick={() => handleMove(index, -1)}
                disabled={index === 0}
                className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30"
                aria-label="Move up"
              >
                <ArrowUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => handleMove(index, 1)}
                disabled={index === items.length - 1}
                className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30"
                aria-label="Move down"
              >
                <ArrowDown size={12} />
              </button>
            </div>
            <input
              type="text"
              value={item.label}
              onChange={(e) => handleFieldChange(item.clientKey, { label: e.target.value })}
              placeholder="e.g. Standard TV wall mount"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-0 focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            />
            <input
              type="number"
              value={item.amount}
              onChange={(e) => handleFieldChange(item.clientKey, { amount: e.target.value })}
              placeholder="180.00"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            />
            <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
              <input
                type="checkbox"
                checked={item.active}
                onChange={(e) => handleFieldChange(item.clientKey, { active: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-gray-300 text-[#004B93] focus:ring-[#004B93]"
              />
              Active
            </label>
            <button
              type="button"
              onClick={() => handleDelete(item)}
              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors shrink-0"
              title="Remove item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#004B93] border border-[#004B93] rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Item
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#004B93] text-white rounded-lg hover:bg-[#003d7a] disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
