import EmailParser from '../components/EmailParser'
import LeadsList from '../components/LeadsList'
import AssignedLeads from '../components/AssignedLeads'
import DemoToggle from '../components/DemoToggle'
import NavBar from '../components/NavBar'
import RevenueWidget from '../components/RevenueWidget'

export default function ManagerDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Manager Dashboard</h2>
            <p className="text-gray-500 text-sm">Manage leads, assign technicians, and monitor activity.</p>
          </div>
          <DemoToggle />
        </div>
        <RevenueWidget />
        <EmailParser />
        <LeadsList />
        <AssignedLeads />
      </main>
    </div>
  )
}