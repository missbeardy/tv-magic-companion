import { PRODUCT_KINDS } from './catalog'
import { usePlacement } from './usePlacement'

/**
 * The full catalogue sits ~700px below the stage, so on a phone choosing a size
 * used to change a TV that was off-screen — the see → change → see loop never
 * closed. This row keeps the sizes for the current product kind within reach of
 * the wall itself. Desktop already shows both at once, so it stays hidden there.
 */
export default function SizeChips() {
  const { visibleCatalog, productId, setProductId, product } = usePlacement()

  if (visibleCatalog.length < 2) return null

  const kindLabel = PRODUCT_KINDS.find((kind) => kind.id === product.kind)?.label ?? 'Product'

  return (
    <div className="min-w-0 shrink-0 border-t border-[var(--c-line)] bg-white lg:hidden">
      <div
        className="campaign-scroll-x flex gap-1.5 overflow-x-auto px-2 py-2"
        role="group"
        aria-label={`${kindLabel} size`}
      >
        {visibleCatalog.map((item) => {
          const selected = item.id === productId
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              aria-label={item.label}
              onClick={() => setProductId(item.id)}
              className={`min-h-11 shrink-0 border px-3 font-[Maven_Pro,sans-serif] text-xs font-bold tabular-nums ${
                selected
                  ? 'border-[var(--c-cyan-ink)] bg-[var(--c-cyan-ink)] text-white'
                  : 'border-[var(--c-navy)]/40 text-[var(--c-navy)]'
              }`}
            >
              {item.shortLabel}
            </button>
          )
        })}
      </div>
    </div>
  )
}
