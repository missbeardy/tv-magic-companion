import { motion } from 'motion/react'
import { PRODUCT_KINDS } from './catalog'
import { usePlacement } from './usePlacement'
import { ProductGlyph } from './ProductGlyph'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

export default function ProductPicker() {
  const { productId, setProductId, kindFilter, setKindFilter, visibleCatalog, product } = usePlacement()
  const reduced = usePrefersReducedMotion()

  return (
    <section id="catalog" className="border-t border-[var(--c-line)] px-4 py-10 sm:px-5 md:px-10 md:py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="campaign-display text-2xl uppercase sm:text-3xl md:text-5xl">
          Pick what goes on the wall<span className="text-[var(--c-cyan)]">.</span>
        </h2>
        <p className="mt-3 max-w-xl text-sm text-[var(--c-body)] sm:text-base">
          White-label sizes — your TV, soundbar, video wall, speakers or art. Designed. Delivered.
          Installed.
        </p>

        <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:mt-8 sm:flex-wrap sm:overflow-visible sm:px-0" role="tablist" aria-label="Product type">
          {PRODUCT_KINDS.map((kind) => {
            const active = kindFilter === kind.id
            return (
              <button
                key={kind.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setKindFilter(kind.id)}
                className={`min-h-10 shrink-0 rounded-none border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] sm:px-4 sm:text-xs sm:tracking-[0.14em] ${
                  active
                    ? 'border-[var(--c-cyan)] bg-[var(--c-cyan)] text-white'
                    : 'border-[var(--c-navy)] text-[var(--c-navy)]'
                }`}
              >
                {kind.label}
              </button>
            )
          })}
        </div>

        <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:mt-6 sm:gap-3 sm:px-0">
          {visibleCatalog.map((item, index) => {
            const selected = item.id === productId
            return (
              <motion.button
                key={item.id}
                type="button"
                layout
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : index * 0.04, duration: 0.35 }}
                onClick={() => setProductId(item.id)}
                aria-pressed={selected}
                aria-label={item.label}
                className={`relative min-w-[5.75rem] shrink-0 snap-start border bg-white px-2 py-3 text-left sm:min-w-[7.5rem] sm:px-3 sm:py-4 ${
                  selected ? 'border-[var(--c-cyan)] border-2' : 'border-[var(--c-navy)]/40'
                }`}
              >
                {selected && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--c-cyan)] text-white">
                    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                      <path d="M2 6.2 L4.6 9 L10 3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </span>
                )}
                <ProductGlyph
                  item={item}
                  className={`h-10 w-full ${selected ? 'text-[var(--c-cyan)]' : 'text-[var(--c-navy)]'}`}
                />
                <span className="mt-3 block font-[Maven_Pro,sans-serif] text-sm font-bold text-[var(--c-navy)]">
                  {item.shortLabel}
                </span>
                <span className="mt-0.5 block text-[11px] text-[var(--c-body)]">{item.label}</span>
              </motion.button>
            )
          })}
        </div>
        <p className="mt-4 text-sm text-[var(--c-body)]">
          Selected: <strong className="text-[var(--c-navy)]">{product.label}</strong> · {product.widthMm} ×{' '}
          {product.heightMm} mm
        </p>
      </div>
    </section>
  )
}
