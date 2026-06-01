import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'
import TimerWatcher from './TimerWatcher'

export default function NavBar() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const isManager = profile?.role === 'manager'
  const bgColor = isManager ? '#004B93' : '#00B4C5'

  const links = isManager
    ? [
        { to: '/manager', label: 'Dashboard' },
        { to: '/calendar', label: 'Calendar' },
      ]
    : [
        { to: '/employee', label: 'Dashboard' },
        { to: '/calendar', label: 'Calendar' },
      ]

  return (
    <>
      <TimerWatcher />
      <nav className="text-white px-6 py-4 flex items-center justify-between" style={{ backgroundColor: bgColor }}>
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold">TVMagic Companion</h1>
          <div className="flex gap-1">
            {links.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                  location.pathname === link.to
                    ? 'bg-white bg-opacity-20'
                    : 'hover:bg-white hover:bg-opacity-10'
                }`}
              >
                {link.label}
              </Link>
            ))}
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