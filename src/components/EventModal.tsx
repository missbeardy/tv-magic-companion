import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

interface Event {
  id?: string
  title: string
  description: string
  start_time: string
  end_time: string
  user_id?: string
  color: string
}

interface Profile {
  id: string
  full_name: string
}

interface Props {
  event?: Event | null
  defaultDate?: string
  onClose: () => void
  onSaved: () => void
}

export default function EventModal({ event, defaultDate, onClose, onSaved }: Props) {
  const { profile } = useAuth()
  const [title, setTitle] = useState(event?.title || '')
  const [description, setDescription] = useState(event?.description || '')
  const [startTime, setStartTime] = useState(
    event?.start_time
      ? new Date(event.start_time).toISOString().slice(0, 16)
      : defaultDate || new Date().toISOString().slice(0, 16)
  )
  const [endTime, setEndTime] = useState(
    event?.end_time
      ? new Date(event.end_time).toISOString().slice(0, 16)
      : defaultDate || new Date().toISOString().slice(0, 16)
  )
  const [color, setColor] = useState(event?.color || '#004B93')
  const [selectedUserId, setSelectedUserId] = useState(event?.user_id || profile?.id || '')
  const [employees, setEmployees] = useState<Profile[]>([])
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile?.role === 'manager') {
      supabase
        .from('profiles')
        .select('id, full_name')
        .then(({ data }) => { if (data) setEmployees(data) })
    }
  }, [profile])

  async function handleSave() {
    if (!title || !startTime || !endTime) {
      setError('Please fill in all required fields.')
      return
    }
    setSaving(true)
    setSyncing(false)
    setError('')

    const payload = {
      title,
      description,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      color,
      user_id: selectedUserId,
    }

    let error

    if (event?.id) {
      setSyncing(true)
      await new Promise(r => setTimeout(r, 1200))
      const result = await supabase
        .from('events')
        .update(payload)
        .eq('id', event.id)
      error = result.error
      setSyncing(false)
    } else {
      const result = await supabase.from('events').insert(payload)
      error = result.error
    }

    if (error) {
      setError('Failed to save event: ' + error.message)
    } else {
      onSaved()
      onClose()
    }

    setSaving(false)
  }

  async function handleDelete() {
    if (!event?.id) return
    await supabase.from('events').delete().eq('id', event.id)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          {event?.id ? 'Edit Event' : 'New Event'}
        </h3>

        {syncing && (
          <div className="bg-blue-50 text-blue-600 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Syncing changes back to CRM...
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              placeholder="Event title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              placeholder="Optional details"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start *
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End *
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              />
            </div>
          </div>

          {profile?.role === 'manager' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assign To
              </label>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Colour
            </label>
            <div className="flex gap-2">
              {['#004B93', '#00B4C5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition ${color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          {event?.id && (
            <button
              onClick={handleDelete}
              className="border border-red-300 text-red-500 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition"
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-[#004B93] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#003d7a] transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : event?.id ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}