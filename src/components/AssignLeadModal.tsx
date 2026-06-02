import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getExpiresAt } from '../lib/timer'
import { useDemo } from '../context/DemoContext'

interface Lead {
  id: string
  name: string
  service_type: string
}

interface Profile {
  id: string
  full_name: string
  avatar_url?: string
  phone?: string
  suburb?: string
}

interface Props {
  lead: Lead
  onClose: () => void
  onAssigned: () => void
}

export default function AssignLeadModal({ lead, onClose, onAssigned }: Props) {
  const { demoMode } = useDemo()
  const [employees, setEmployees] = useState<Profile[]>([])
  const [countMap, setCountMap] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchData() {
      const { data: employeeData } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, phone, suburb')
        .eq('role', 'employee')

      if (!employeeData) return
      setEmployees(employeeData)

      const { data: activeCounts } = await supabase
        .from('leads')
        .select('assigned_to')
        .eq('status', 'assigned')

      const counts: Record<string, number> = {}
      activeCounts?.forEach((l) => {
        if (l.assigned_to) counts[l.assigned_to] = (counts[l.assigned_to] ?? 0) + 1
      })
      setCountMap(counts)
    }
    fetchData()
  }, [])

  const minCount = employees.length > 0
    ? Math.min(...employees.map((e) => countMap[e.id] ?? 0))
    : 0

  async function handleAssign(employeeId: string) {
    setSaving(true)
    setError('')
    const expiresAt = getExpiresAt(demoMode)
    const { error } = await supabase
      .from('leads')
      .update({
        status: 'assigned',
        assigned_to: employeeId,
        assigned_at: new Date().toISOString(),
        timer_expires_at: expiresAt,
        demo_mode: demoMode,
      })
      .eq('id', lead.id)

    if (error) {
      setError('Failed to assign: ' + error.message)
      setSaving(false)
    } else {
      onAssigned()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Assign Lead</h3>
        <p className="text-sm text-gray-500 mb-4">{lead.name} · {lead.service_type}</p>

        {demoMode && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm p-3 rounded-lg mb-4">
            ⚡ Demo mode — timer set to 30 seconds
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        <p className="text-sm font-medium text-gray-700 mb-3">Select Technician</p>

        <div className="space-y-3 max-h-72 overflow-y-auto mb-6">
          {employees.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Loading technicians...</p>
          )}
          {employees.map((emp) => {
            const activeCount = countMap[emp.id] ?? 0
            const isRecommended = activeCount === minCount
            return (
              <button
                key={emp.id}
                disabled={saving}
                onClick={() => handleAssign(emp.id)}
                className={`w-full text-left flex items-center gap-4 p-3 rounded-xl border-2 transition hover:shadow-md disabled:opacity-50 ${
                  isRecommended
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-200 bg-white hover:border-[#004B93]'
                }`}
              >
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-[#004B93] flex items-center justify-center text-white font-bold text-lg shrink-0 overflow-hidden">
                  {emp.avatar_url
                    ? <img src={emp.avatar_url} className="w-full h-full object-cover" />
                    : emp.full_name.charAt(0)
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm">{emp.full_name}</p>
                  {emp.suburb && <p className="text-xs text-gray-400">{emp.suburb}</p>}
                  <p className="text-xs text-gray-500 mt-0.5">{activeCount} active lead{activeCount !== 1 ? 's' : ''}</p>
                </div>

                {/* Badge */}
                <div className="shrink-0">
                  {isRecommended && (
                    <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full font-semibold">
                      ★ Best
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <button
          onClick={onClose}
          disabled={saving}
          className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}