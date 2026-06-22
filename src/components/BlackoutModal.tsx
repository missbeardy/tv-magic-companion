// src/components/BlackoutModal.tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

interface Profile {
  id: string
  full_name: string
}

interface BlackoutModalProps {
  employees: Profile[]
  onClose: () => void
  onSaved: () => void
}

export default function BlackoutModal({ employees, onClose, onSaved }: BlackoutModalProps) {
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const [targetUserId, setTargetUserId] = useState(isManager ? '' : profile?.id ?? '')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [reason, setReason] = useState('On Leave')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setError('')
    if (!targetUserId) {
      setError('Please select who this leave is for.')
      return
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('End date cannot be before start date.')
      return
    }

    setSaving(true)
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const targetName = isManager
        ? employees.find(e => e.id === targetUserId)?.full_name ?? 'Employee'
        : profile?.full_name ?? 'Employee'

      const { error: insertError } = await supabase.from('events').insert([{
        title: `${reason || 'On Leave'} – ${targetName}`,
        description: reason,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        user_id: targetUserId,
        org_id: profile?.org_id,
        color: '#111827',
        category: 'Leave',
      }])

      if (insertError) throw insertError
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Could not save leave. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Block Out Day(s)</h2>
        <p className="text-sm text-gray-500 mb-4">
          {isManager
            ? 'Mark an employee as unavailable. This will show as a leave block on the calendar.'
            : 'Mark yourself as unavailable. This will show as a leave block on the calendar.'}
        </p>

        {isManager && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Who is this for?</label>
            <select
              value={targetUserId}
              onChange={e => setTargetUserId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            >
              <option value="">Select employee…</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value)
                if (e.target.value > endDate) setEndDate(e.target.value)
              }}
              className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End date</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="On Leave, Sick Day, Annual Leave…"
            className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#004B93]"
          />
        </div>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-black transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Block Out Day(s)'}
          </button>
        </div>
      </div>
    </div>
  )
}