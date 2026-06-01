import { useAuth } from '../context/AuthContext'
import LeadsList from '../components/LeadsList'
import AssignedLeads from '../components/AssignedLeads'

export default function EmployeeDashboard() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#00B4C5] text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">TVMagic Companion</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-80">
            {profile?.full_name} · Employee
          </span>
          <button
            onClick={signOut}
            className="text-sm bg-white text-[#00B4C5] px-3 py-1 rounded-lg font-medium hover:bg-gray-100 transition"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <main className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">
            My Dashboard
          </h2>
          <p className="text-gray-500 text-sm">
            View your assigned leads and pick up new ones from the pool.
          </p>
        </div>

        <AssignedLeads />
        <LeadsList />
      </main>
    </div>
  )
}