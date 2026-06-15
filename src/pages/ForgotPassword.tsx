// src/pages/ForgotPassword.tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { Tv2, Mail } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleReset() {
    setLoading(true)
    setError('')
    const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (e) {
      setError('Something went wrong. Please try again.')
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
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
            <h2 className="font-display font-semibold text-gray-900 text-lg">Reset password</h2>
            <p className="text-sm text-gray-400 mt-0.5">Enter your email and we'll send you a reset link</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {sent ? (
            <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-xl text-sm">
              Check your email for a password reset link.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  <Mail size={11} className="inline mr-1" />Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleReset()}
                  placeholder="you@company.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
                />
              </div>

              <button
                onClick={handleReset}
                disabled={loading || !email}
                className="w-full py-2.5 rounded-xl bg-[#004B93] text-white text-sm font-semibold hover:bg-[#003d7a] transition-colors disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </>
          )}

          <p className="text-center text-xs text-gray-400">
            <Link to="/login" className="text-[#004B93] hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by FieldBourne Digital
        </p>
      </div>
    </div>
  )
}