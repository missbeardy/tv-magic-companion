// src/pages/CalendarPage.tsx
import { useState } from 'react'
import Calendar from '../components/Calendar'
import EventModal from '../components/EventModal'
import NavBar from '../components/NavBar' // This will light up now!
import { CalendarDays, Plus } from 'lucide-react'

export default function CalendarPage() {
  const [showModal, setShowModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
  
    <div className="w-full min-h-screen bg-gray-50">
      
      {/* 2. RENDER THE NAVBAR HERE */}
      <NavBar />

      {/* Main Content Container */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-gray-900 text-xl flex items-center gap-2">
              <CalendarDays size={20} className="text-brand" />
              Calendar
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">Your appointments and scheduled jobs</p>
          </div>
              </div>

        {/* Calendar */}
        <div className="card overflow-hidden">
          <Calendar key={refreshKey} />
        </div>

        {/* Event modal */}
        {showModal && (
          <EventModal
            onClose={() => setShowModal(false)}
            onSaved={() => { setShowModal(false); setRefreshKey(k => k + 1) }}
          />
        )}
      </div>
    </div>
  )
}