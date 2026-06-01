import { useAuth } from '../context/AuthContext'
import EmailParser from '../components/EmailParser'
import LeadsList from '../components/LeadsList'
import AssignedLeads from '../components/AssignedLeads'
import DemoToggle from '../components/DemoToggle'

export default function ManagerDashboard() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#004B93] text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">TVMagic Companion</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-80">
            {profile?.full_name} · Manager
          </span>
          <button
            onClick={signOut}
            className="text-sm bg-white text-[#004B93] px-3 py-1 rounded-lg font-medium hover:bg-gray-100 transition"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <main className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">
              Manager Dashboard
            </h2>
            <p className="text-gray-500 text-sm">
              Manage leads, assign technicians, and monitor activity.
            </p>
          </div>
          <DemoToggle />
        </div>

        <EmailParser />
        <LeadsList />
        <AssignedLeads />
      </main>
    </div>
  )
}