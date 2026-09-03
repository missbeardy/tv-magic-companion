import { Plus, X } from 'lucide-react'
import type { LineItem } from '../lib/lineItems'

interface Props {
  items: LineItem[]
  onChange: (items: LineItem[]) => void
  disabled?: boolean
}

export default function LineItemsEditor({ items, onChange, disabled }: Props) {
  function addBlankLine() {
    onChange([...items, { label: '', amount: 0 }])
  }

  function updateLine(index: number, patch: Partial<LineItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function removeLine(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">

      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input
                type="text"
                value={item.label}
                onChange={(e) => updateLine(index, { label: e.target.value })}
                disabled={disabled}
                placeholder="Line item"
                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm min-w-0"
              />
              <input
                type="number"
                value={item.amount}
                onChange={(e) => updateLine(index, { amount: Number(e.target.value) || 0 })}
                disabled={disabled}
                min="0"
                step="0.01"
                inputMode="decimal"
                className="w-24 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeLine(index)}
                disabled={disabled}
                className="p-1.5 text-gray-400 hover:text-red-600 shrink-0"
                aria-label="Remove line item"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addBlankLine}
        disabled={disabled}
        className="text-xs text-[var(--color-primary)] font-semibold flex items-center gap-1 disabled:opacity-50"
      >
        <Plus size={12} /> Add line
      </button>
    </div>
  )
}
