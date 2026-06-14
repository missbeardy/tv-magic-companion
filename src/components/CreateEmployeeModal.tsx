// src/components/CreateEmployeeModal.tsx
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { X, UserPlus, Mail, Lock, User, Shield } from 'lucide-react'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function CreateEmployeeModal({ onClose, onCreated }: Props) {
  const { profile } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'employee' | 'manager'>('employee')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ✅ THIS IS THE ONLY FUNCTION THAT CHANGED
  async function handleCreate() {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields')
      return
    }
    setSaving(true)
    setError('')

    try {
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          role,
          orgId: profile?.org_id,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Creation failed')

      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ✅ EVERYTHING BELOW IS EXACTLY THE SAME AS BEFORE
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#004B93]/10 flex items-center justify-center">
              <UserPlus size={15} className="text-[#004B93]" />
            </div>
            <h3 className="font-display font-semibold text-gray-900 text-base">Add Team Member</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Full name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <User size={11} className="inline mr-1" />Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <Mail size={11} className="inline mr-1" />Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jane@company.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <Lock size={11} className="inline mr-1" />Temporary Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <Shield size={11} className="inline mr-1" />Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['employee', 'manager'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-semibold capitalize transition-all ${
                    role === r
                      ? 'border-[#004B93] bg-[#004B93]/5 text-[#004B93]'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#004B93] text-white text-sm font-semibold hover:bg-[#003d7a] transition-colors disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>
  )
}