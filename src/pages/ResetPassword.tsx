// src/pages/ResetPassword.tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Tv2, Lock } from 'lucide-react'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleUpdate() {
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError('')
    const { error: e } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (e) {
      setError('Failed to update password. Your link may have expired.')
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#004B93] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#004B93]/25">
            <Tv2 size={28} className="text-white" />
          </div>
          <h1 className="font-display font-bold text-gray-900 text-2xl tracking-tight">
            TV<span className="text-[#00B4C5]">Magic</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Companion</p>
        </div>

        <div className="card p-6 space-y-4">
          <div>
            <h2 className="font-display font-semibold text-gray-900 text-lg">New password</h2>
            <p className="text-sm text-gray-400 mt-0.5">Choose a strong password for your account</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <Lock size={11} className="inline mr-1" />New password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <Lock size={11} className="inline mr-1" />Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUpdate()}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
            />
          </div>

          <button
            onClick={handleUpdate}
            disabled={loading || !password || !confirm}
            className="w-full py-2.5 rounded-xl bg-[#004B93] text-white text-sm font-semibold hover:bg-[#003d7a] transition-colors disabled:opacity-60"
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by FieldBourne Digital
        </p>
      </div>
    </div>
  )
}