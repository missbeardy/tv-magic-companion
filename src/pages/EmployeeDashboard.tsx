import NavBar from '../components/NavBar'
import LeadsList from '../components/LeadsList'
import AssignedLeads from '../components/AssignedLeads'


export default function EmployeeDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
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