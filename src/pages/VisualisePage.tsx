import { useEffect } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import '../campaign/campaign.css'
import { PlacementProvider } from '../campaign/PlacementContext'
import CampaignNav from '../campaign/CampaignNav'
import VisualiserStage from '../campaign/VisualiserStage'
import ProductPicker from '../campaign/ProductPicker'
import QuoteSheet from '../campaign/QuoteSheet'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useIsMobile } from '../campaign/useIsMobile'

export default function VisualisePage() {
  const reduced = usePrefersReducedMotion()

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
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--c-line)] bg-white px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] lg:hidden">
          <a href="#quote" className="campaign-btn min-h-11 w-full">
            Book a free quote
          </a>
        </div>
      </div>
    </PlacementProvider>
  )
}

function Hero({ reduced }: { reduced: boolean }) {
  const isMobile = useIsMobile()
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 400], [0, reduced || isMobile ? 0 : 40])

  return (
    <section className="mx-auto grid max-w-[1400px] lg:min-h-[100dvh] lg:grid-cols-[minmax(16rem,32%)_1fr]">
      <motion.div
        className="order-2 flex flex-col justify-center px-4 py-6 sm:px-5 md:px-10 lg:order-1 lg:py-0"
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
        <div className="mt-5 hidden flex-wrap gap-3 sm:mt-8 sm:flex">
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
        className="order-1 h-[min(62dvh,560px)] min-h-[320px] border-[var(--c-line)] lg:order-2 lg:h-auto lg:min-h-[100dvh] lg:border-l"
      >
        <VisualiserStage />
      </motion.div>
    </section>
  )
}

function CampaignFooter() {
  return (
    <footer className="border-t border-[var(--c-line)] px-5 py-12 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:justify-between">
        <div>
          <p className="campaign-display text-xl">TV MAGIC</p>
          <p className="mt-2 max-w-sm text-sm text-[var(--c-body)]">
            Real people. Real solutions. <span className="text-[var(--c-cyan)]">Magic results.</span>
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
