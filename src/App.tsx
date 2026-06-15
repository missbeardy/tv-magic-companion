// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { DemoProvider } from './context/DemoContext'
import { OrgProvider } from './context/OrgContext'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import SetPasswordPage from './pages/SetPasswordPage'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ManagerDashboard from './pages/ManagerDashboard'
import EmployeeDashboard from './pages/EmployeeDashboard'
import CalendarPage from './pages/CalendarPage'
import AllLeadsPage from './pages/AllLeadsPage'
import LeadsPage from './pages/LeadsPage'
import SupportPage from './pages/SupportPage';
import ProfilePage from './pages/ProfilePage'
import SocialPage from './pages/SocialPage'
import TaskBoardPage from './pages/TaskBoardPage'
import OrgSettingsPage from './pages/OrgSettingsPage'
import { useEffect } from 'react'
import { useTechLocation } from './hooks/useTechLocation'
import { initOneSignal, setOneSignalUser, clearOneSignalUser } from './lib/oneSignal'

function Dashboard() {
  const { profile, loading } = useAuth()

  useTechLocation(profile?.id ?? null)

  useEffect(() => {
    if (profile?.id) {
      setOneSignalUser(profile.id).catch(err =>
        console.error('OneSignal user link failed:', err)
      )
    } else if (!loading && !profile) {
      clearOneSignalUser().catch(() => {})
    }
  }, [profile?.id, loading])

  if (loading) return <p className="p-4 text-gray-400">Loading...</p>
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role === 'manager') return <ManagerDashboard />
  return <EmployeeDashboard />
}

function App() {
  console.log('🔴 App component mounted - checking if this prints')

  useEffect(() => {
    console.log('🔴 useEffect running')
    initOneSignal().catch(err =>
      console.error('OneSignal init failed:', err)
    )

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.log('SW failed:', err))
    }
  }, [])

  return (
    <AuthProvider>
      <DemoProvider>
        <OrgProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/login" element={<Login />} />
              <Route path="/set-password" element={<SetPasswordPage />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/support" element={<ProtectedRoute> <SupportPage /> </ProtectedRoute> }/>
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/manager"
                element={
                  <ProtectedRoute requiredRole="manager">
                    <ManagerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/employee"
                element={
                  <ProtectedRoute requiredRole="employee">
                    <EmployeeDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leads"
                element={
                  <ProtectedRoute>
                    <LeadsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/calendar"
                element={
                  <ProtectedRoute>
                    <CalendarPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/all-leads"
                element={
                  <ProtectedRoute requiredRole="manager">
                    <AllLeadsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/social"
                element={
                  <ProtectedRoute requiredRole="manager">
                    <SocialPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tasks"
                element={
                  <ProtectedRoute>
                    <TaskBoardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/org-settings"
                element={
                  <ProtectedRoute requiredRole="manager">
                    <OrgSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/test" element={<p style={{ padding: 20 }}>Test page works</p>} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </OrgProvider>
      </DemoProvider>
    </AuthProvider>
  )
}

export default App