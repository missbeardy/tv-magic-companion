import { useState } from 'react'
import EmailParser from '../components/EmailParser'
import LeadsList from '../components/LeadsList'
import AssignedLeads from '../components/AssignedLeads'
import DemoToggle from '../components/DemoToggle'
import NavBar from '../components/NavBar'
import RevenueWidget from '../components/RevenueWidget'
import CreateEmployeeModal from '../components/CreateEmployeeModal'

export default function ManagerDashboard() {
  const [showCreateEmployee, setShowCreateEmployee] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      {showCreateEmployee && (
        <CreateEmployeeModal
          onClose={() => setShowCreateEmployee(false)}
          onCreated={() => setShowCreateEmployee(false)}
        />
      )}
      <main className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Manager Dashboard</h2>
            <p className="text-gray-500 text-sm">Manage leads, assign technicians, and monitor activity.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DemoToggle />
            <button
              onClick={() => setShowCreateEmployee(true)}
              className="text-sm bg-[#00B4C5] text-white px-4 py-2 rounded-lg hover:bg-[#009aaa] transition"
            >
              + New Employee
            </button>
          </div>
        </div>
        <RevenueWidget />
        <EmailParser />
        <LeadsList />
        <AssignedLeads />
      </main>
    </div>
  )
}