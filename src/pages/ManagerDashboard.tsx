import EmailParser from '../components/EmailParser'
import LeadsList from '../components/LeadsList'
import AssignedLeads from '../components/AssignedLeads'
import DemoToggle from '../components/DemoToggle'
import NavBar from '../components/NavBar'
import RevenueWidget from '../components/RevenueWidget'
import { Link } from 'react-router-dom'

export default function ManagerDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Manager Dashboard</h2>
            <p className="text-gray-500 text-sm">
              Monitor operations, oversee active assignments, and balance lead volume.
            </p>
          </div>
          <DemoToggle />
        </div>

        {/* Revenue Widget */}
        <RevenueWidget />

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Link
            to="/leads"
            className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md transition text-center"
          >
            <span className="text-2xl">📋</span>
            <span className="text-sm font-semibold text-gray-700">Kanban Board</span>
            <span className="text-xs text-gray-400">View all lead stages</span>
          </Link>
          <Link
            to="/calendar"
            className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md transition text-center"
          >
            <span className="text-2xl">📅</span>
            <span className="text-sm font-semibold text-gray-700">Calendar</span>
            <span className="text-xs text-gray-400">All team appointments</span>
          </Link>
          <Link
            to="/social"
            className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md transition text-center col-span-2 sm:col-span-1"
          >
            <span className="text-2xl">📲</span>
            <span className="text-sm font-semibold text-gray-700">Social Media</span>
            <span className="text-xs text-gray-400">Share completed jobs</span>
          </Link>
        </div>

        {/* Email Parser */}
        <EmailParser />

        {/* Unassigned Pool */}
        <LeadsList />

        {/* Manager's Own Assigned Leads */}
        <AssignedLeads />

      </main>
    </div>
  )
}