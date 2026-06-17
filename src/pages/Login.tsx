import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Tv2, Mail, Lock, LogIn } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const { setProfile } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // State for dynamically discovered tenant branding
  const [dynamicLogo, setDynamicLogo] = useState<string | null>(null)

  // Debounce email typing to look up organization branding pre-auth
  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setDynamicLogo(null) // Reset if email becomes incomplete or invalid
      return
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        // 1. Look up the user's public profile link via email
        const { data: profileLookup, error: pError } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('email', email.trim().toLowerCase()) // Assumes your profiles table tracks email
          .maybeSingle()

        if (pError || !profileLookup?.org_id) return

        // 2. Fetch the logo tied to that organization
        const { data: orgLookup } = await supabase
          .from('orgs')
          .select('logo_url')
          .eq('id', profileLookup.org_id)
          .maybeSingle()

        if (orgLookup?.logo_url) {
          setDynamicLogo(orgLookup.logo_url)
        }
      } catch (err) {
        console.error('Pre-auth branding lookup failed:', err)
      }
    }, 400) // 400ms debounce buffer while typing

    return () => clearTimeout(delayDebounceFn)
  }, [email])

  async function handleLogin() {
    setLoading(true)
    setError('')
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password })
      if (e) {
        setError('Invalid email or password')
        setLoading(false)
      } else {
        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData?.session?.user) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', sessionData.session.user.id)
            .single()
          if (profileData) setProfile(profileData)
        }
        navigate('/')
      }
    } catch (err) {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo Frame */}
        <div className="text-center mb-8">
          {dynamicLogo ? (
            /* Shows their customized brand logo smoothly when recognized */
            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg p-2 border border-gray-100 transition-all duration-300 transform scale-105">
              <img 
                src={dynamicLogo} 
                alt="Business Branding" 
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            /* Default fallback app logo container */
            <div className="w-14 h-14 bg-[#004B93] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#004B93]/25 transition-all duration-300">
              <Tv2 size={28} className="text-white" />
            </div>
          )}
          
          <h1 className="font-display font-bold text-gray-900 text-2xl tracking-tight">
            TV<span className="text-[#00B4C5]">Magic</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Companion</p>
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#004B93] transition-colors"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#004B93] text-white text-sm font-semibold hover:bg-[#003d7a] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <LogIn size={15} />
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {/* Forgot password */}
          <p className="text-center text-xs text-gray-400">
            <Link to="/forgot-password" className="text-[#004B93] hover:underline">
              Forgot your password?
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