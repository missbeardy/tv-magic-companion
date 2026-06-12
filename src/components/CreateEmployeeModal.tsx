import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function CreateEmployeeModal({ onClose, onCreated }: Props) {
  const { profile } = useAuth()  // ← ADD THIS to get current user's org
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleCreate() {
    if (!fullName || !email || !password) {
      setError('Please fill in all fields.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    // Check if current user has an org_id
    if (!profile?.org_id) {
      setError('Your account is not associated with a franchise. Please contact support.')
      return
    }

    setSaving(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-employee`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ 
          email, 
          full_name: fullName, 
          password,
          org_id: profile.org_id  // ← ADD THIS - pass org_id to edge function
        }),
      }
    )

    const result = await response.json()

    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }

    setSuccess(true)
    setSaving(false)
    setTimeout(() => {
      onCreated()
      onClose()
    }, 1500)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Create Employee Account</h3>
        <p className="text-sm text-gray-500 mb-4">
          This creates a login for a new technician. Send them the password separately.
        </p>

        {/* Show which franchise they're being added to */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-xs text-blue-700 font-medium">
            🏢 Adding to: <span className="font-semibold">{profile?.org_id === '11111111-1111-1111-1111-111111111111' ? 'Default Organization' : 'Your Franchise'}</span>
          </p>
          <p className="text-xs text-blue-600 mt-1">
            This employee will only have access to your franchise's data.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>
        )}
        {success && (
          <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm">
            ✅ Employee account created!
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Jake Smith"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jake@tvmagic.com.au"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Temporary Password</label>
            <input
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            />
            <p className="text-xs text-gray-400 mt-1">The employee can change this from their profile page.</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || success}
            className="flex-1 bg-[#004B93] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#003d7a] transition disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  )
}