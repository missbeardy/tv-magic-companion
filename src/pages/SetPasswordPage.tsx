// src/pages/SetPasswordPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Tv2, Lock, CheckCircle, AlertCircle } from 'lucide-react'

type Stage = 'loading' | 'set-password' | 'success' | 'error'

export default function SetPasswordPage() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Supabase puts the session tokens in the URL hash after the user clicks
    // the invite email link. We call getSession() which automatically reads
    // those tokens and establishes a temporary session — then we can update
    // the password on that session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // We have a valid session from the invite link — show the password form
        setStage('set-password')
      } else {
        // No session — the link may have expired or already been used
        setErrorMsg('This invite link has expired or has already been used. Ask your manager to send a new invite.')
        setStage('error')
      }
    })
  }, [])

  async function handleSetPassword() {
    if (!password || password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setSaving(true)
    setErrorMsg('')

    // updateUser() sets the password on the currently active session
    // (the one established from the invite link token)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setErrorMsg(error.message || 'Failed to set password. Please try again.')
      setSaving(false)
      return
    }

    // Password set successfully — show success then redirect to dashboard
    setStage('success')
    setTimeout(() => navigate('/'), 2000)
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

        {/* Loading */}
        {stage === 'loading' && (
          <div className="card p-6 text-center text-gray-400 text-sm">
            Verifying your invite link…
          </div>
        )}

        {/* Set password form */}
        {stage === 'set-password' && (
          <div className="card p-6 space-y-4">
            <div>
              <h2 className="font-display font-semibold text-gray-900 text-lg">Welcome! Create your password</h2>
              <p className="text-sm text-gray-400 mt-0.5">Choose a password to access your account</p>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm flex items-start gap-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                <Lock size={11} className="inline mr-1" />New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                <Lock size={11} className="inline mr-1" />Confirm Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                placeholder="Repeat your password"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
              />
            </div>

            <button
              onClick={handleSetPassword}
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-[#004B93] text-white text-sm font-semibold hover:bg-[#003d7a] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? 'Setting password…' : 'Set Password & Sign In'}
            </button>
          </div>
        )}

        {/* Success */}
        {stage === 'success' && (
          <div className="card p-6 text-center space-y-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle size={24} className="text-green-600" />
            </div>
            <h2 className="font-display font-semibold text-gray-900 text-lg">Password set!</h2>
            <p className="text-sm text-gray-400">Taking you to your dashboard…</p>
          </div>
        )}

        {/* Error / expired link */}
        {stage === 'error' && (
          <div className="card p-6 text-center space-y-3">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={24} className="text-red-500" />
            </div>
            <h2 className="font-display font-semibold text-gray-900 text-lg">Link expired</h2>
            <p className="text-sm text-gray-500">{errorMsg}</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-2.5 rounded-xl bg-[#004B93] text-white text-sm font-semibold hover:bg-[#003d7a] transition-colors"
            >
              Back to Login
            </button>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by FieldBourne Digital
        </p>
      </div>
    </div>
  )
}