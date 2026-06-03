import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import NavBar from '../components/NavBar'
import LeadsList from '../components/LeadsList'
import AssignedLeads from '../components/AssignedLeads'
import { saveScheduleCache, loadScheduleCache } from '../lib/scheduleCache'

export default function EmployeeDashboard() {
  const { profile } = useAuth()
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const on = () => setIsOffline(false)
    const off = () => setIsOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    if (!profile || isOffline) return

    async function primeCache() {
      const { data: fetchedLeads } = await supabase
        .from('leads')
        .select('*')
        .or(`status.eq.unassigned,assigned_to.eq.${profile!.id}`)

      const { data: fetchedEvents } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', profile!.id)

      // Cache the fetched data directly if both exist
      if (fetchedLeads && fetchedEvents) {
        saveScheduleCache({ leads: fetchedLeads, events: fetchedEvents })
      }
    }

    primeCache()
  }, [profile, isOffline])

  const cached = isOffline ? loadScheduleCache() : null

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">My Dashboard</h2>
          <p className="text-gray-500 text-sm">
            View your assigned leads and pick up new ones from the pool.
          </p>
        </div>

        {isOffline && cached && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
            <p className="font-semibold mb-2">📶 Offline — showing cached data</p>
            <p className="font-medium mt-2">Your Leads ({cached.leads.length})</p>
            {cached.leads.map((l: any) => (
              <div key={l.id} className="mt-1 text-xs text-amber-800">
                • {l.name} — {l.status}
              </div>
            ))}
            <p className="font-medium mt-3">Your Events ({cached.events.length})</p>
            {cached.events.map((e: any) => (
              <div key={e.id} className="mt-1 text-xs text-amber-800">
                • {e.title} — {new Date(e.start_time).toLocaleDateString('en-AU')}
              </div>
            ))}
          </div>
        )}

        {!isOffline && (
          <>
            <AssignedLeads />
            <LeadsList />
          </>
        )}
      </main>
    </div>
  )
}