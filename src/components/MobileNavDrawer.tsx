import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogOut, X } from 'lucide-react'
import type { NavLinkItem } from '../lib/navConfig'
import { isNavActive } from '../lib/navConfig'

interface Props {
  isOpen: boolean
  onClose: () => void
  links: NavLinkItem[]
  onSignOut: () => void
  profileName?: string | null
}

export default function MobileNavDrawer({
  isOpen,
  onClose,
  links,
  onSignOut,
  profileName,
}: Props) {
  const location = useLocation()
  const drawerLinks = links.filter((l) => !l.primaryMobile)
  const prevPath = useRef(location.pathname)

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (prevPath.current === location.pathname) return
    prevPath.current = location.pathname
    onClose()
  }, [location.pathname, onClose])

  if (!isOpen) return null

  return (
    <div className="md:hidden fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />

      <div
        className="relative w-full bg-white rounded-t-2xl shadow-2xl animate-slide-up max-h-[50vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="More navigation"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-display font-semibold text-gray-900 text-sm">Menu</p>
            {profileName && (
              <p className="text-xs text-gray-400 truncate max-w-[200px]">{profileName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <ul className="overflow-y-auto flex-1 py-1">
          {drawerLinks.map((link) => {
            const Icon = link.icon
            const active = isNavActive(location.pathname, link.to)
            return (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className={`flex items-center gap-3 px-4 min-h-[44px] text-sm font-medium transition-colors ${
                    active ? 'text-[var(--color-primary)] bg-blue-50/80' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={18} className="shrink-0" />
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="border-t border-gray-100 shrink-0 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={() => {
              onClose()
              onSignOut()
            }}
            className="flex items-center gap-3 w-full px-4 min-h-[48px] text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
