import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'
import TimerWatcher from './TimerWatcher'
import DemoBanner from './DemoBanner'

export default function NavBar() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const isManager = profile?.role === 'manager'
  const [menuOpen, setMenuOpen] = useState(false)

  const links = isManager
    ? [
        { to: '/manager', label: 'Dashboard', icon: '⊞' },
        { to: '/leads', label: 'Leads', icon: '📋' },
        { to: '/calendar', label: 'Calendar', icon: '📅' },
      ]
    : [
        { to: '/employee', label: 'Dashboard', icon: '⊞' },
        { to: '/leads', label: 'Leads', icon: '📋' },
        { to: '/calendar', label: 'Calendar', icon: '📅' },
      ]

  const navBg = isManager
    ? 'linear-gradient(135deg, #004B93 0%, #0066cc 100%)'
    : 'linear-gradient(135deg, #00B4C5 0%, #0099aa 100%)'

  const drawerBg = isManager
    ? 'linear-gradient(180deg, #003d7a 0%, #004B93 40%, #005bb5 100%)'
    : 'linear-gradient(180deg, #008a99 0%, #00B4C5 40%, #00cfe3 100%)'

  return (
    <>
      <TimerWatcher />
      <DemoBanner />

      {/* Top bar */}
      <nav
        className="sticky top-0 z-40 text-white px-4 py-3 flex items-center justify-between shadow-lg"
        style={{ background: navBg }}
      >
        <div className="flex items-center gap-3">
          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex flex-col gap-1.5 p-1.5 rounded-lg hover:bg-white hover:bg-opacity-15 transition mr-1"
            aria-label="Open menu"
          >
            <span className="block w-5 h-0.5 bg-white rounded-full" />
            <span className="block w-5 h-0.5 bg-white rounded-full" />
            <span className="block w-5 h-0.5 bg-white rounded-full" />
          </button>

          <img
            src="/tvmagic-logo.png"
            alt="TVMagic"
            className="h-9 w-9 object-contain rounded-lg"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div>
            <p className="text-base font-bold leading-tight">TVMagic</p>
            <p className="text-xs opacity-70 leading-tight">Companion</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-sm opacity-80 hidden sm:inline">
            {profile?.full_name}
          </span>
        </div>
      </nav>

      {/* Backdrop — semi-transparent, doesn't black out */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50"
          style={{ backdropFilter: 'blur(2px)', backgroundColor: 'rgba(0,0,0,0.25)' }}
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Slide-in Drawer */}
      <div
        className={`fixed top-0 left-0 h-full w-72 z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: drawerBg }}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <img
              src="/tvmagic-logo.png"
              alt="TVMagic"
              className="h-11 w-11 object-contain rounded-xl bg-white bg-opacity-10 p-1"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div>
              <p className="font-bold text-white text-base">TVMagic</p>
              <p className="text-xs text-white opacity-60">Companion</p>
            </div>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            className="text-white opacity-60 hover:opacity-100 transition w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:bg-opacity-15 text-xl"
          >
            ×
          </button>
        </div>

        {/* User Card */}
        <div className="mx-4 mb-4 p-4 rounded-2xl bg-white bg-opacity-10 border border-white border-opacity-20">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold bg-white bg-opacity-20"
            >
              {profile?.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <p className="text-gray-900 font-semibold text-sm">{profile?.full_name}</p>
              <p className="text-gray-500 text-xs capitalize">{profile?.role}</p>
            </div>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        <p className="text-white opacity-40 text-xs font-semibold uppercase tracking-widest px-3 mb-2">
            Navigation
        </p>
        {links.map(link => {
            const isActive = location.pathname === link.to
            return (
            <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-all group ${
                isActive
                    ? 'bg-white text-[#004B93] font-semibold shadow-md'
                    : 'text-white hover:bg-white hover:text-[#004B93]'
                }`}
            >
                <span className="text-lg">{link.icon}</span>
                
                {/* The text color now dynamically updates on hover using group-hover or conditional styles */}
                <span className={`${isActive ? 'text-[#004B93]' : 'text-white group-hover:text-[#004B93]'}`}>
                {link.label}
                </span>

                {isActive && (
                <span className="ml-auto w-2 h-2 rounded-full bg-[#004B93]" />
                )}
            </Link>
            )
        })}
        </nav>

        {/* Sign Out */}
        <div className="px-4 py-5 border-t border-white border-opacity-10">
          <button
            onClick={() => { signOut(); setMenuOpen(false) }}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium text-white hover:bg-white hover:bg-opacity-15 transition"
          >
            <span className="text-lg">🚪</span>
            Sign Out
          </button>
        </div>
      </div>    
    </>
  )
}