// src/components/NavBar.tsx
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useDemo } from '../context/DemoContext'
import NotificationBell from './NotificationBell'
import {
  LayoutDashboard,
  Kanban,
  CalendarDays,
  Users,
  Share2,
  Settings,
  LogOut,
  Menu,
  X,
  Tv2,
  User,        // ← ADDED
} from 'lucide-react'

export default function NavBar() {
  const { profile } = useAuth()
  const { demoMode } = useDemo()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const navLinks = [
    { to: '/',              label: 'Dashboard',         icon: LayoutDashboard, roles: ['manager', 'employee'] },
    { to: '/leads',         label: 'Leads',             icon: Kanban,          roles: ['manager', 'employee'] },
    { to: '/calendar',      label: 'Calendar',          icon: CalendarDays,    roles: ['manager', 'employee'] },
    { to: '/all-leads',     label: 'All Leads',         icon: Users,           roles: ['manager'] },
    { to: '/social',        label: 'Social',            icon: Share2,          roles: ['manager'] },
    { to: '/org-settings',  label: 'Franchise Settings', icon: Settings,       roles: ['manager'] },
    { to: '/profile',       label: 'Profile',           icon: User,            roles: ['manager', 'employee'] }, // ← ADDED
  ].filter(link => link.roles.includes(profile?.role ?? ''))

  function isActive(to: string) {
    if (to === '/') return location.pathname === '/'
    return location.pathname.startsWith(to)
  }

  return (
    <>
      <nav className="sticky top-0 z-40 bg-[#004B93] shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">

            {/* Left side: mobile hamburger + logo */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Menu"
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>

              <Link to="/" className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 bg-white/15 rounded-lg flex items-center justify-center">
                  <Tv2 size={15} className="text-white" />
                </div>
                <span className="font-display font-800 text-white text-base tracking-tight leading-none">
                  TV<span className="text-[#00B4C5]">Magic</span>
                </span>
                {demoMode && (
                  <span className="badge badge-amber ml-1">Demo</span>
                )}
              </Link>
            </div>

            {/* Desktop links (center) */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map(link => {
                const Icon = link.icon
                const active = isActive(link.to)
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon size={15} />
                    {link.label}
                  </Link>
                )
              })}
            </div>

            {/* Right side: notification bell + avatar + logout */}
            <div className="flex items-center gap-2">
              <NotificationBell />

              <div className="hidden md:flex items-center gap-2 ml-1 pl-3 border-l border-white/20">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-white font-bold text-xs">
                    {profile?.full_name?.charAt(0) ?? '?'}
                  </span>
                </div>
                <span className="text-white/80 text-sm font-medium max-w-[100px] truncate">
                  {profile?.full_name}
                </span>
                <button
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

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#003d7a] animate-fade-in">
            <div className="px-4 py-3 space-y-1">
              {navLinks.map(link => {
                const Icon = link.icon
                const active = isActive(link.to)
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon size={17} />
                    {link.label}
                  </Link>
                )
              })}

              <div className="pt-2 mt-2 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">
                      {profile?.full_name?.charAt(0) ?? '?'}
                    </span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">{profile?.full_name}</p>
                    <p className="text-white/50 text-xs capitalize">{profile?.role}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-medium transition-colors"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  )
}