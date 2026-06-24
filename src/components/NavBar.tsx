// src/components/NavBar.tsx
import { useEffect, useCallback, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { useTheme } from '../context/ThemeContext'
import NotificationBell from './NotificationBell'
import MobileBottomNav from './MobileBottomNav'
import MobileNavDrawer from './MobileNavDrawer'
import { filterNavLinks, isDrawerRoute, isNavActive } from '../lib/navConfig'
import { LogOut, Menu, Tv2 } from 'lucide-react'

function BrandLogo({ compact = false }: { compact?: boolean }) {
  const theme = useTheme()
  const size = compact ? 'w-6 h-6' : 'w-7 h-7'
  const iconSize = compact ? 14 : 15

  return theme.logoUrl ? (
    <img
      src={theme.logoUrl}
      alt={theme.displayName}
      className={`${size} object-contain rounded bg-white p-0.5`}
    />
  ) : (
    <div className={`${size} bg-white/15 rounded-lg flex items-center justify-center`}>
      <Tv2 size={iconSize} className="text-white" />
    </div>
  )
}

export default function NavBar() {
  const { profile, signOut } = useAuth()
  const { canAccessFeature } = useOrg()
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const navLinks = filterNavLinks(profile?.role, canAccessFeature)
  const drawerActive = isDrawerRoute(location.pathname, navLinks)

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <>
      {/* ── Mobile top bar ── */}
      <nav className="md:hidden sticky top-0 z-40 bg-brand shadow-lg">
        <div className="flex items-center justify-between h-12 px-3">
          <Link to="/" aria-label="Home" className="shrink-0">
            <BrandLogo compact />
          </Link>

          <div className="flex items-center gap-0.5">
            <NotificationBell />
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="relative p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Open menu"
            >
              <Menu size={20} />
              {drawerActive && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[var(--color-primary)]" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Desktop top bar ── */}
      <nav className="hidden md:block sticky top-0 z-40 bg-brand shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14 gap-2">
            <Link to="/" aria-label="Home" className="shrink-0">
              <BrandLogo />
            </Link>

            <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {navLinks.map((link) => {
                const Icon = link.icon
                const active = isNavActive(location.pathname, link.to)
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon size={15} />
                    <span>{link.label}</span>
                  </Link>
                )
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <NotificationBell />
              <div className="flex items-center gap-2 ml-1 pl-3 border-l border-white/20">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-white font-bold text-xs">
                    {profile?.full_name?.charAt(0) ?? '?'}
                  </span>
                </div>
                <span className="text-white/80 text-sm font-medium max-w-[100px] truncate">
                  {profile?.full_name}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  title="Sign out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <MobileBottomNav links={navLinks} />

      <MobileNavDrawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        links={navLinks}
        onSignOut={handleLogout}
        profileName={profile?.full_name}
      />
    </>
  )
}
