import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface Props {
  children: React.ReactNode
  requiredRole?: 'manager' | 'employee'
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

  if (!user) return <Navigate to="/login" replace />

  if (requiredRole && profile?.role !== requiredRole) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}