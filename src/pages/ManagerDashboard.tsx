import { useState } from 'react'
import EmailParser from '../components/EmailParser'
import LeadsList from '../components/LeadsList'
import AssignedLeads from '../components/AssignedLeads'
import DemoToggle from '../components/DemoToggle'
import NavBar from '../components/NavBar'
import RevenueWidget from '../components/RevenueWidget'
import LeadSocialModal from '../components/LeadSocialModal'

interface SimpleLead {
  id: string
  name: string
  service_type?: string
  address?: string
}

export default function ManagerDashboard() {
  const [socialLead, setSocialLead] = useState<SimpleLead | null>(null)
  const [socialPhotoUrl, setSocialPhotoUrl] = useState<string>('')

  const triggerSocialModal = (lead: SimpleLead, photoUrl: string) => {
    setSocialLead(lead)
    setSocialPhotoUrl(photoUrl)
  }

  const closeSocialModal = () => {
    setSocialLead(null)
    setSocialPhotoUrl('')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Manager Dashboard Hub</h2>
            <p className="text-gray-500 text-sm">Monitor regional operations, oversee active assignments, and balance lead volume.</p>
          </div>
          <DemoToggle />
        </div>
        <RevenueWidget />
        <EmailParser />
        
        {/* Unassigned Pool */}
        <LeadsList onShareSocial={triggerSocialModal} />
        
        {/* Custom Isolated Trackers Filtered Exclusively to Manager User Scope ID */}
        <AssignedLeads />
      </main>

      {socialLead && socialPhotoUrl && (
        <LeadSocialModal 
          lead={socialLead}
          photoUrl={socialPhotoUrl}
          onClose={closeSocialModal}
        />
      )}
    </div>
  )
}