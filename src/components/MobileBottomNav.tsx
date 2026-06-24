import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { NavLinkItem } from '../lib/navConfig'
import { isNavActive } from '../lib/navConfig'
import { useLeadsPoolCount } from '../hooks/useLeadsPoolCount'
import NavTabBadge from './NavTabBadge'
import MobileNavFab from './MobileNavFab'

interface Props {
  links: NavLinkItem[]
}

export default function MobileBottomNav({ links }: Props) {
  const location = useLocation()
  const poolCount = useLeadsPoolCount()
  const tabs = links.filter((l) => l.primaryMobile)
  const showFab = location.pathname === '/leads' || location.pathname.startsWith('/leads/')

  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const tabRowRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState({ x: 0, w: 0, ready: false })
  const [popIndex, setPopIndex] = useState<number | null>(null)
  const prevActiveRef = useRef(-1)

  const activeIndex = tabs.findIndex((l) => isNavActive(location.pathname, l.to))

  useEffect(() => {
    if (activeIndex >= 0 && activeIndex !== prevActiveRef.current) {
      setPopIndex(activeIndex)
      prevActiveRef.current = activeIndex
    }
  }, [activeIndex])

  useLayoutEffect(() => {
    let raf = 0
    const measure = () => {
      const el = tabRefs.current[activeIndex]
      if (!el || activeIndex < 0) {
        setPill((p) => ({ ...p, ready: false }))
        return
      }
      setPill({ x: el.offsetLeft, w: el.offsetWidth, ready: true })
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    if (tabRowRef.current) ro.observe(tabRowRef.current)
    tabRefs.current.forEach((node) => {
      if (node) ro.observe(node)
    })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [activeIndex, tabs.length, showFab])

  if (tabs.length === 0) return null

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 pb-[env(safe-area-inset-bottom,0px)] pointer-events-none"
      aria-label="Primary navigation"
    >
      <div className="pointer-events-auto mx-3 mb-2 relative">
        {showFab && <MobileNavFab />}
        <div
          className={`mobile-bottom-nav-shell rounded-t-2xl bg-brand shadow-[0_-4px_24px_rgba(0,0,0,0.18)] border border-white/10 border-b-0 overflow-visible ${
            showFab ? 'mobile-bottom-nav-shell--notched' : ''
          }`}
        >
          <div
            ref={tabRowRef}
            className={`relative flex h-16 ${showFab ? 'pr-14' : ''}`}
          >
            <div
              className="nav-pill-indicator"
              aria-hidden="true"
              style={{
                width: pill.w,
                transform: `translateX(${pill.x}px)`,
                opacity: pill.ready ? 1 : 0,
              }}
            />
            {tabs.map((link, i) => {
              const Icon = link.icon
              const active = isNavActive(location.pathname, link.to)
              const isLeads = link.to === '/leads'
              const iconPop = popIndex === i

              return (
                <Link
                  key={link.to}
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
                  to={link.to}
                  aria-current={active ? 'page' : undefined}
                  aria-label={
                    isLeads && poolCount > 0
                      ? `${link.label}, ${poolCount} unassigned leads`
                      : undefined
                  }
                  className="nav-tab-link relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] touch-manipulation"
                  style={{
                    color: active ? 'var(--color-secondary)' : 'rgba(255,255,255,0.55)',
                  }}
                  onAnimationEnd={() => {
                    if (iconPop) setPopIndex(null)
                  }}
                >
                  <span
                    className={`relative inline-flex ${iconPop ? 'nav-icon-pop' : ''}`}
                    onAnimationEnd={(e) => {
                      e.stopPropagation()
                      if (iconPop) setPopIndex(null)
                    }}
                  >
                    <Icon size={22} strokeWidth={active ? 2.25 : 2} aria-hidden="true" />
                    {isLeads && <NavTabBadge count={poolCount} />}
                  </span>
                  <span className="text-[10px] font-semibold leading-none">{link.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
