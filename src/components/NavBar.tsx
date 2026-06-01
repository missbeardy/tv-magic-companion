import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'
import TimerWatcher from './TimerWatcher'
import DemoBanner from './DemoBanner'

export default function NavBar() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const isManager = profile?.role === 'manager'
  const bgColor = isManager ? '#004B93' : '#00B4C5'

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

  return (
    <>
      <TimerWatcher />
      <DemoBanner />

      {/* Top bar */}
      <nav
        className="sticky top-0 z-40 text-white px-4 py-3 flex items-center justify-between shadow-md"
        style={{ backgroundColor: bgColor }}
      >
        <div className="flex items-center gap-3">
          <img
            src="/tvmagic-logo.png"
            alt="TVMagic"
            className="h-9 w-9 object-contain rounded"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <span className="text-base font-bold leading-tight">
            TVMagic<br />
            <span className="text-xs font-normal opacity-80">Companion</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-sm opacity-80 hidden sm:inline">
            {profile?.full_name} · {isManager ? 'Manager' : 'Employee'}
          </span>
          <button
            onClick={signOut}
            className="text-xs bg-white px-3 py-1.5 rounded-lg font-medium hover:bg-gray-100 transition"
            style={{ color: bgColor }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Bottom tab bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-white border-opacity-20 shadow-2xl"
        style={{ backgroundColor: bgColor }}
      >
        {links.map(link => {
          const isActive = location.pathname === link.to
          return (
            <Link
              key={link.to}
              to={link.to}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition"
            >
              <div
                className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition ${
                  isActive ? 'bg-white bg-opacity-20' : ''
                }`}
              >
                <span className="text-xl leading-none">{link.icon}</span>
                <span
                  className={`text-xs font-medium ${
                    isActive ? 'text-white' : 'text-white opacity-60'
                  }`}
                >
                  {link.label}
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Spacer so content doesn't hide behind bottom bar */}
      <div className="h-16" />
    </>
  )
}