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
        { to: '/manager', label: 'Dashboard' },
        { to: '/leads', label: 'Leads' },
        { to: '/calendar', label: 'Calendar' },
      ]
    : [
        { to: '/employee', label: 'Dashboard' },
        { to: '/leads', label: 'Leads' },
        { to: '/calendar', label: 'Calendar' },
      ]

  return (
    <>
      <TimerWatcher />
      <DemoBanner />
      <nav className="text-white px-6 py-3 flex items-center justify-between" style={{ backgroundColor: bgColor }}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <img
              src="/tvmagic-logo.png"
              alt="TVMagic"
              className="h-10 w-10 object-contain rounded"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <span className="text-lg font-bold">TVMagic Companion</span>
          </div>
          <div className="flex gap-1">
            {links.map(link => {
              const isActive = location.pathname === link.to
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-white !text-[#004B93] shadow-sm font-semibold'
                      : 'text-white hover:bg-white hover:bg-opacity-15'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <span className="text-sm opacity-80">
            {profile?.full_name} · {isManager ? 'Manager' : 'Employee'}
          </span>
          <button
            onClick={signOut}
            className="text-sm bg-white px-3 py-1 rounded-lg font-medium hover:bg-gray-100 transition"
            style={{ color: bgColor }}
          >
            Sign Out
          </button>
        </div>
      </nav>
    </>
  )
}