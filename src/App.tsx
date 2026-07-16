// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { OrgProvider } from './context/OrgContext'
import { ThemeProvider } from './context/ThemeContext'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import SetPasswordPage from './pages/SetPasswordPage'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ManagerDashboard from './pages/ManagerDashboard'
import EmployeeDashboard from './pages/EmployeeDashboard'
import CalendarPage from './pages/CalendarPage'
import LeadsPage from './pages/LeadsPage'
import SupportPage from './pages/SupportPage';
import ProfilePage from './pages/ProfilePage'
import SocialPage from './pages/SocialPage'
import ReportsPage from './pages/ReportsPage'
import OrgSettingsPage from './pages/OrgSettingsPage'
import PlatformAdminPage from './pages/PlatformAdminPage'
import QuoteAcceptPage from './pages/QuoteAcceptPage'
import InvoiceStatusPage from './pages/InvoiceStatusPage'
import TeamActivityPage from './pages/TeamActivityPage'
import { useEffect } from 'react'
import { useTechLocation } from './hooks/useTechLocation'
import { initOneSignal, setOneSignalUser, clearOneSignalUser } from './lib/oneSignal'
import { isManagerRole } from './lib/roles'
import PwaUpdateLayer from './components/PwaUpdateLayer'
import OfflineBanner from './components/OfflineBanner'

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }
  if (!profile) return <Navigate to="/login" replace />
  if (isManagerRole(profile.role)) return <ManagerDashboard />
  return <EmployeeDashboard />
}

function App() {
  useEffect(() => {
    initOneSignal().catch(err =>
      console.error('OneSignal init failed:', err)
    )
  }, [])

  return (
    <AuthProvider>
        <OrgProvider>
          <ThemeProvider>
          <PwaUpdateLayer>
          <OfflineBanner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/login" element={<Login />} />
              <Route path="/quote/:token" element={<QuoteAcceptPage />} />
              <Route path="/invoice/:token" element={<InvoiceStatusPage />} />
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
                path="/activity"
                element={
                  <ProtectedRoute>
                    <TeamActivityPage />
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
                path="/reports"
                element={
                  <ProtectedRoute requiredRole="manager">
                    <ReportsPage />
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
              <Route
                path="/platform"
                element={
                  <ProtectedRoute requiredRole="platform_admin">
                    <PlatformAdminPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
          </PwaUpdateLayer>
          </ThemeProvider>
        </OrgProvider>
    </AuthProvider>
  )
}

export default App