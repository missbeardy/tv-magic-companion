import { useAuth } from '../context/AuthContext'
import Calendar from '../components/Calendar'
import NotificationBell from '../components/NotificationBell'
import TimerWatcher from '../components/TimerWatcher'

export default function CalendarPage() {
  const { profile, signOut } = useAuth()
  const isManager = profile?.role === 'manager'

  return (
    <div className="min-h-screen bg-gray-50">
      <TimerWatcher />
      <nav
        className="text-white px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: isManager ? '#004B93' : '#00B4C5' }}
      >
        <h1 className="text-xl font-bold">TVMagic Companion</h1>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <span className="text-sm opacity-80">
            {profile?.full_name} · {isManager ? 'Manager' : 'Employee'}
          </span>
          <button
            onClick={signOut}
            className="text-sm bg-white px-3 py-1 rounded-lg font-medium hover:bg-gray-100 transition"
            style={{ color: isManager ? '#004B93' : '#00B4C5' }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      <main className="p-6 max-w-6xl mx-auto space-y-6">
        <h2 className="text-2xl font-bold text-gray-800">Calendar</h2>
        <Calendar />
      </main>
    </div>
  )
}