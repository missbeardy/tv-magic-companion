// File: src/components/NavBar.tsx
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { useTheme } from '../context/ThemeContext'
import { useDemo } from '../context/DemoContext'
import NotificationBell from './NotificationBell'
import {
  LayoutDashboard,
  Kanban,
  CalendarDays,
  Share2,
  Settings,
  LogOut,
  Menu,
  X,
  Tv2,
  User,
  ClipboardList,
  HelpCircle,
  Building2,
} from 'lucide-react'

export default function NavBar() {
  const { profile, signOut } = useAuth()
  const { canAccessFeature } = useOrg()
  const theme = useTheme()
  const { demoMode } = useDemo()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const managerRoles = ['manager', 'platform_admin']
  const allRoles = ['manager', 'employee', 'platform_admin']

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  const navLinks = [
    { to: '/',              label: 'Dashboard',          icon: LayoutDashboard, roles: allRoles, feature: null as string | null },
    { to: '/leads',         label: 'Leads',              icon: Kanban,          roles: allRoles, feature: 'leads' },
    { to: '/calendar',      label: 'Calendar',           icon: CalendarDays,    roles: allRoles, feature: 'calendar' },
    { to: '/tasks',         label: 'Tasks',              icon: ClipboardList,   roles: allRoles, feature: 'tasks' },
    { to: '/social',        label: 'Social',             icon: Share2,          roles: managerRoles, feature: 'social' },
    { to: '/org-settings',  label: 'Franchise Settings', icon: Settings,        roles: managerRoles, feature: null },
    { to: '/platform',      label: 'Platform',           icon: Building2,       roles: ['platform_admin'], feature: null },
    { to: '/support',       label: 'Support',            icon: HelpCircle,      roles: allRoles, feature: null },
    { to: '/profile',       label: 'Profile',            icon: User,            roles: allRoles, feature: null },
  ].filter(link => {
    const role = profile?.role ?? ''
    if (!role || !link.roles.includes(role)) return false
    if (link.feature && !canAccessFeature(link.feature)) return false
    return true
  })

  function isActive(to: string) {
    if (to === '/') return location.pathname === '/'
    return location.pathname.startsWith(to)
  }

  return (
    <>
      <nav className="sticky top-0 z-40 bg-brand shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14 gap-2">

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              {theme.logoUrl ? (
                <img
                  src={theme.logoUrl}
                  alt="Brand Logo"
                  className="w-7 h-7 object-contain rounded bg-white p-0.5"
                />
              ) : (
                <div className="w-7 h-7 bg-white/15 rounded-lg flex items-center justify-center">
                  <Tv2 size={15} className="text-white" />
                </div>
              )}

              <span className="font-display font-800 text-white text-base tracking-tight leading-none max-w-[120px] truncate sm:max-w-none">
                {theme.displayName}
              </span>
              {demoMode && (
                <span className="badge badge-amber ml-1">Demo</span>
              )}
            </Link>

            {/* Nav links — always visible; scroll horizontally on small screens */}
            <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {navLinks.map(link => {
                const Icon = link.icon
                const active = isActive(link.to)
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
                    <span className="hidden sm:inline">{link.label}</span>
                  </Link>
                )
              })}
            </div>

            {/* Right side: notification bell + avatar + logout */}
            <div className="flex items-center gap-2 shrink-0">
              <NotificationBell />

              <div className="hidden sm:flex items-center gap-2 ml-1 pl-3 border-l border-white/20">
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

              {/* Mobile: menu for profile + logout when name is hidden */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="sm:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Account menu"
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile account menu */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-white/10 bg-brand-dark animate-fade-in">
            <div className="px-4 py-3 space-y-1">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
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