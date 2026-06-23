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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole && profile && !roleMatches(requiredRole, profile.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
