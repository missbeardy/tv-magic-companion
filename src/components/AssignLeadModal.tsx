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
}

interface Props {
  lead: Lead
  onClose: () => void
  onAssigned: () => void
}

export default function AssignLeadModal({ lead, onClose, onAssigned }: Props) {
  const { demoMode } = useDemo()
  const [employees, setEmployees] = useState<Profile[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchEmployees() {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'employee')
      if (data) setEmployees(data)
    }
    fetchEmployees()
  }, [])

  async function handleAssign() {
    if (!selectedEmployee) return
    setSaving(true)
    setError('')

    const expiresAt = getExpiresAt(demoMode)

    const { error } = await supabase
      .from('leads')
      .update({
        status: 'assigned',
        assigned_to: selectedEmployee,
        assigned_at: new Date().toISOString(),
        timer_expires_at: expiresAt,
        demo_mode: demoMode,
      })
      .eq('id', lead.id)

    if (error) {
      setError('Failed to assign lead: ' + error.message)
    } else {
      onAssigned()
      onClose()
    }

    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">
          Assign Lead
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {lead.name} · {lead.service_type}
        </p>

        {demoMode && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm p-3 rounded-lg mb-4">
            ⚡ Demo mode active — timer set to 30 seconds
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Employee
        </label>
        <select
          value={selectedEmployee}
          onChange={e => setSelectedEmployee(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93] mb-4"
        >
          <option value="">-- Select an employee --</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>
              {emp.full_name}
            </option>
          ))}
        </select>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedEmployee || saving}
            className="flex-1 bg-[#004B93] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#003d7a] transition disabled:opacity-50"
          >
            {saving ? 'Assigning...' : 'Assign Lead'}
          </button>
        </div>
      </div>
    </div>
  )
}