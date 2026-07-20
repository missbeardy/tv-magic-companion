import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth, type Profile } from '../context/AuthContext'
import { normalizeRole } from '../lib/roles'
import { Mail, Lock, LogIn } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const { establishSession, user, profile, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loadingForm, setLoadingForm] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && user && profile) {
      navigate('/', { replace: true })
    }
  }, [loading, user, profile, navigate])

  async function handleLogin() {
    setLoadingForm(true)
    setError('')
    try {
      const { data: authData, error: e } = await supabase.auth.signInWithPassword({ email, password })
      if (e) {
        const detail = import.meta.env.DEV ? `: ${e.message}` : ''
        setError(`Sign in failed${detail}`)
        setLoadingForm(false)
        return
      }

      const userId = authData.user?.id ?? authData.session?.user?.id
      if (!userId) {
        setError('Sign in succeeded but no session was returned. Try again.')
        setLoadingForm(false)
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (profileError) {
        const detail = import.meta.env.DEV ? ` (${profileError.message})` : ''
        setError(`Could not load your profile. Check dev database setup.${detail}`)
        console.error('Profile fetch error:', profileError)
        await supabase.auth.signOut()
        setLoadingForm(false)
        return
      }

      if (!profileData) {
        setError(
          'No profile found for this account. Run supabase/migrations/20250624120000_fix_dev_rls_white_screen.sql in dev Supabase.'
        )
        await supabase.auth.signOut()
        setLoadingForm(false)
        return
      }

      if (!profileData.org_id) {
        setError('Your profile is not linked to an organisation. Run the dev seed SQL.')
        await supabase.auth.signOut()
        setLoadingForm(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setError('Sign in succeeded but no session was returned. Try again.')
        setLoadingForm(false)
        return
      }

      const role = normalizeRole(profileData.role) ?? profileData.role
      establishSession(session.user, { ...(profileData as Profile), role: role as Profile['role'] })
      navigate('/')
      setLoadingForm(false)
    } catch (err) {
      setError('An unexpected error occurred')
      setLoadingForm(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Hardcoded Logo Container */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg p-2 border border-gray-100">
            <img 
              src="/fieldbourne-logo.png"
              alt="FieldBourne"
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <h1 className="font-display font-bold text-gray-900 text-2xl tracking-tight">
            FieldBourne <span className="text-brand-secondary">Companion</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Sign in to your franchise</p>
        </div>

        {/* Card */}
        <div className="card p-6 space-y-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h2 className="font-display font-semibold text-gray-900 text-lg">Sign in</h2>
            <p className="text-sm text-gray-400 mt-0.5">Enter your credentials to continue</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <Mail size={11} className="inline mr-1" />Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="you@company.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-brand transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <Lock size={11} className="inline mr-1" />Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-brand transition-colors"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loadingForm}
            className="w-full py-2.5 rounded-xl btn-primary text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <LogIn size={15} />
            {loadingForm ? 'Signing in…' : 'Sign in'}
          </button>

          {/* Forgot password */}
          <p className="text-center text-xs text-gray-400">
            <Link to="/forgot-password" className="text-brand-secondary hover:underline">
              Forgot your password?
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by FieldBourne Digital
        </p>
        {import.meta.env.VITE_ENABLE_PLATFORM_FEATURES === 'true' && import.meta.env.VITE_SUPABASE_URL && (
          <p className="text-center text-xs text-gray-300 mt-2 font-mono">
            Dev DB: {import.meta.env.VITE_SUPABASE_URL.replace('https://', '').split('.')[0]}
          </p>
        )}
      </div>
    </div>
  )
}