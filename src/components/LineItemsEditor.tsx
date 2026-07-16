import { Plus, X } from 'lucide-react'
import type { LineItem } from '../lib/lineItems'
import type { PriceListItem } from '../lib/priceList'

interface Props {
  items: LineItem[]
  onChange: (items: LineItem[]) => void
  priceListItems?: PriceListItem[]
  onUseChip?: (item: PriceListItem) => void
  disabled?: boolean
}

export default function LineItemsEditor({ items, onChange, priceListItems, onUseChip, disabled }: Props) {
  function addChip(item: PriceListItem) {
    onChange([...items, { label: item.label, amount: item.amount }])
    onUseChip?.(item)
  }

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
      {priceListItems && priceListItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {priceListItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => addChip(item)}
              disabled={disabled}
              className="text-xs px-2.5 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              {item.label} — ${item.amount.toFixed(2)}
            </button>
          ))}
        </div>
      )}

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
