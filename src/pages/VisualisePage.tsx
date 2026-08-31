import { useEffect, useState } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import '../campaign/campaign.css'
import { PlacementProvider } from '../campaign/PlacementContext'
import CampaignNav from '../campaign/CampaignNav'
import VisualiserStage from '../campaign/VisualiserStage'
import ProductPicker from '../campaign/ProductPicker'
import QuoteSheet from '../campaign/QuoteSheet'
import { PROOF_POINTS } from '../campaign/proof'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useIsMobile } from '../campaign/useIsMobile'

/**
 * The staff PWA pins `html, body { height: 100% }` so the app shell scrolls
 * `body` instead of the viewport. This public route needs the viewport back:
 * window-based scroll tracking drives the nav progress rule and the hero
 * parallax, and iOS only collapses its URL bar for the real scroller.
 */
function useWindowScroller() {
  useEffect(() => {
    const targets = [document.documentElement, document.body]
    targets.forEach((el) => el.classList.add('campaign-root'))
    return () => targets.forEach((el) => el.classList.remove('campaign-root'))
  }, [])
}

export default function VisualisePage() {
  const reduced = usePrefersReducedMotion()
  useWindowScroller()

  useEffect(() => {
    const prev = document.title
    document.title = 'See it on your wall — TV Magic'
    const fontId = 'campaign-fonts'
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link')
      link.id = fontId
      link.rel = 'stylesheet'
      link.href =
        'https://fonts.googleapis.com/css2?family=Maven+Pro:wght@500;700;900&family=Open+Sans:wght@400;600;700&display=swap'
      document.head.appendChild(link)
    }
    return () => {
      document.title = prev
    }
  }, [])

  return (
    <PlacementProvider>
      <div className="campaign pb-[4.75rem] lg:pb-0">
        <CampaignNav />
        <Hero reduced={reduced} />
        <ProductPicker />
        <QuoteSheet />
        <CampaignFooter />
        <StickyQuoteBar />
      </div>
    </PlacementProvider>
  )
}

/**
 * Stands down once the quote form is on screen — otherwise the same words sit
 * on the page twice, and the bar covers the fields it is pointing at.
 */
function StickyQuoteBar() {
  const [formInView, setFormInView] = useState(false)

  useEffect(() => {
    const form = document.getElementById('quote')
    if (!form || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setFormInView(entry.isIntersecting),
      { rootMargin: '-15% 0px -25% 0px' }
    )
    observer.observe(form)
    return () => observer.disconnect()
  }, [])

  if (formInView) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--c-line)] bg-white px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] lg:hidden">
      <a href="#quote" className="campaign-btn min-h-11 w-full">
        Book a free quote
      </a>
    </div>
  )
}

function Hero({ reduced }: { reduced: boolean }) {
  const isMobile = useIsMobile()
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 400], [0, reduced || isMobile ? 0 : 40])

  return (
    <section className="mx-auto grid max-w-[1400px] lg:min-h-[100dvh] lg:grid-cols-[minmax(16rem,32%)_1fr]">
      <MobileHeroBand />
      <motion.div
        className="order-3 hidden flex-col justify-center px-4 py-6 sm:px-5 md:px-10 lg:order-1 lg:flex lg:py-0"
        initial={reduced ? false : { opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
      >
        <h1 className="campaign-display text-[clamp(1.85rem,8vw,4.6rem)] uppercase leading-[0.92]">
          See it on
          <br />
          your wall
        </h1>
        <p className="mt-3 max-w-sm text-[var(--c-body)] sm:mt-5 sm:text-lg">We make TV problems disappear.</p>
        <div className="mt-5 flex flex-wrap gap-3 sm:mt-8">
          <a href="#visualise" className="campaign-btn">
            Place it on the wall
          </a>
          <a href="#catalog" className="campaign-btn campaign-btn-ghost">
            Choose a size
          </a>
        </div>
      </motion.div>
      <motion.div
        style={{ y }}
        className="order-2 h-[min(82dvh,760px)] min-h-[440px] min-w-0 border-[var(--c-line)] lg:order-2 lg:h-auto lg:min-h-[100dvh] lg:border-l"
      >
        <VisualiserStage />
      </motion.div>
    </section>
  )
}

/**
 * On a phone the stage comes first in the layout, which used to push the
 * headline to ~660px and the trust numbers to ~1,500px — so the first screen
 * carried no promise and no proof. This compact band puts both above the wall
 * without spending the vertical room the visualiser needs.
 */
function MobileHeroBand() {
  return (
    <div className="order-1 min-w-0 border-b border-[var(--c-line)] px-4 pb-3 pt-4 sm:px-5 lg:hidden">
      <h1 className="campaign-display text-[clamp(1.7rem,9vw,2.6rem)] uppercase leading-[0.94]">
        See it on your wall
      </h1>
      <p className="mt-1.5 text-sm text-[var(--c-body)]">
        We make TV problems disappear. Drag a TV onto your own wall, then book a free quote.
      </p>
      <dl className="mt-3 flex items-baseline justify-between gap-2">
        {PROOF_POINTS.map((point) => (
          <div key={point.label} className="flex min-w-0 items-baseline gap-1">
            <dt className="shrink-0 font-[Maven_Pro,sans-serif] text-[13px] font-black tabular-nums text-[var(--c-navy)]">
              {point.value}
            </dt>
            <dd className="truncate text-[10px] leading-tight text-[var(--c-body)]">{point.shortLabel}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function CampaignFooter() {
  return (
    <footer className="border-t border-[var(--c-line)] px-5 py-12 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:justify-between">
        <div>
          <p className="campaign-display text-xl">TV MAGIC</p>
          <p className="mt-2 max-w-sm text-sm text-[var(--c-body)]">
            Real people. Real solutions. <span className="text-[var(--c-cyan-ink)]">Magic results.</span>
          </p>
        </div>
        <div className="text-sm text-[var(--c-body)]">
          <p className="font-bold uppercase tracking-[0.12em] text-[var(--c-navy)]">Services</p>
          <p className="mt-2 max-w-xs">
            Wall mounting, antennas, Starlink, home theatre, TV points, video walls, soundbars, CCTV.
          </p>
        </div>
        <div className="text-sm text-[var(--c-body)]">
          <p className="font-bold uppercase tracking-[0.12em] text-[var(--c-navy)]">Areas</p>
          <p className="mt-2 max-w-xs">QLD, NSW, VIC, SA, WA — technicians across Australia.</p>
          <a
            className="mt-3 inline-block text-[var(--c-navy)] underline-offset-4 hover:underline"
            href="https://tvmagic.com.au/"
          >
            tvmagic.com.au
          </a>
        </div>
      </div>
    </footer>
  )
}
