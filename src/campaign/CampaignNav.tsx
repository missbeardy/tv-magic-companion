import { useScroll, useSpring, motion } from 'motion/react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const LINKS = [
  { href: '#visualise', label: 'Visualise' },
  { href: '#guarantee', label: 'Guarantee' },
  { href: '#quote', label: 'Quote' },
]

export default function CampaignNav() {
  const { scrollYProgress } = useScroll()
  const reduced = usePrefersReducedMotion()
  const scaleX = useSpring(scrollYProgress, { stiffness: 90, damping: 28, restDelta: 0.001 })

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--c-line)] bg-white pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2 sm:px-4 md:px-6 md:py-3">
        <a href="#visualise" className="campaign-display text-base tracking-tight text-[var(--c-navy)] md:text-xl">
          TV MAGIC
        </a>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-[var(--c-ink)] md:flex" aria-label="Campaign">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-[var(--c-cyan-ink)]">
              {link.label}
            </a>
          ))}
        </nav>
        <a href="#quote" className="campaign-btn min-h-11 px-3 py-2 text-[10px] sm:px-4 sm:text-[11px] md:px-5">
          <span className="sm:hidden">Quote</span>
          <span className="hidden sm:inline">Book a free quote</span>
        </a>
      </div>
      {!reduced && <motion.div className="campaign-progress" style={{ scaleX }} />}
    </header>
  )
}
