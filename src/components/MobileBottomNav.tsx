import { Link, useLocation } from 'react-router-dom'
import type { NavLinkItem } from '../lib/navConfig'
import { isNavActive } from '../lib/navConfig'

interface Props {
  links: NavLinkItem[]
}

export default function MobileBottomNav({ links }: Props) {
  const location = useLocation()
  const tabs = links.filter((l) => l.primaryMobile)

  if (tabs.length === 0) return null

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-brand border-t border-white/15 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary navigation"
    >
      <div className="flex h-16">
        {tabs.map((link) => {
          const Icon = link.icon
          const active = isNavActive(location.pathname, link.to)
          return (
            <Link
              key={link.to}
              to={link.to}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-white' : 'text-white/60'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-white" />
              )}
              <Icon size={22} strokeWidth={active ? 2.25 : 2} />
              <span className="text-[10px] font-semibold leading-none">{link.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
