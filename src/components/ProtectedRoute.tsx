import { Navigate } from 'react-router-dom'
import { useAuth, type UserRole } from '../context/AuthContext'

interface Props {
  children: React.ReactNode
  requiredRole?: UserRole
}

function roleMatches(required: UserRole, actual: UserRole): boolean {
  if (required === actual) return true
  if (required === 'manager' && actual === 'platform_admin') return true
  return false
}

export default function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!user && !profile) {
    return <Navigate to="/login" replace />
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm card p-6 space-y-3 text-center">
          <p className="font-display font-semibold text-gray-900">Could not load your profile</p>
          <p className="text-sm text-gray-500">
            You are signed in but the app cannot read your profile. Check Supabase RLS policies and
            that <code className="text-xs">VITE_SUPABASE_URL</code> matches your dev project ref.
          </p>
          <a href="/login" className="inline-block text-sm text-brand-secondary hover:underline">
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  if (requiredRole && profile && !roleMatches(requiredRole, profile.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <div className="has-mobile-nav md:pb-0">{children}</div>
}
