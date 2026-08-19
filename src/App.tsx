// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AuthProvider } from './context/AuthContext'
import { OrgProvider } from './context/OrgContext'
import { ThemeProvider } from './context/ThemeContext'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import RouteLoadingFallback from './components/RouteLoadingFallback'
import Login from './pages/Login'
import SetPasswordPage from './pages/SetPasswordPage'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ManagerDashboard from './pages/ManagerDashboard'
import EmployeeDashboard from './pages/EmployeeDashboard'
import LeadsPage from './pages/LeadsPage'
import SupportPage from './pages/SupportPage';
import ProfilePage from './pages/ProfilePage'
import TeamActivityPage from './pages/TeamActivityPage'
import { useEffect } from 'react'

// dd7: these are rarely-visited (admin/report/public-link) routes pulling in heavy libraries
// (recharts, @xyflow/react, @dnd-kit) that every field tech was downloading on first load
// regardless of whether they'd ever open them. Lazy-loaded so the login -> leads path stays light.
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const OrgSettingsPage = lazy(() => import('./pages/OrgSettingsPage'))
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage'))
const QuoteAcceptPage = lazy(() => import('./pages/QuoteAcceptPage'))
const InvoiceStatusPage = lazy(() => import('./pages/InvoiceStatusPage'))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'))
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage'))
const DeleteAccountPage = lazy(() => import('./pages/DeleteAccountPage'))
// Lazy for the same reason: a scoreboard is not on the login -> leads critical path.
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'))
import { useTechLocation } from './hooks/useTechLocation'
import { initOneSignal, setOneSignalUser, clearOneSignalUser } from './lib/oneSignal'
import { reconcileSubscription } from './lib/webPush'
import { isManagerRole } from './lib/roles'
import { useOrg } from './context/OrgContext'
import PwaUpdateLayer from './components/PwaUpdateLayer'
import OfflineBanner from './components/OfflineBanner'
import ToastHost from './components/ToastHost'

function Dashboard() {
  const { profile, loading } = useAuth()
  const { isFeatureEnabled, featureSwitchesLoading } = useOrg()
  const nativePush = !featureSwitchesLoading && isFeatureEnabled('native_web_push')

  useTechLocation(profile?.id ?? null)

  useEffect(() => {
    if (profile?.id) {
      // When native Web Push owns delivery, skip OneSignal login so its SW does
      // not keep claiming the push subscription out from under us.
      if (!nativePush && !featureSwitchesLoading) {
        setOneSignalUser(profile.id).catch(err =>
          console.error('OneSignal user link failed:', err)
        )
      }
      // Self-heal the Web Push subscription: repairs a lost server row or a
      // browser-side rotation that happened while the app was closed. No-ops
      // unless permission is already granted. Runs regardless of which transport
      // the brand is on, so subscriptions accumulate before the switch is flipped.
      void reconcileSubscription(profile.id, profile.org_id ?? null)
    } else if (!loading && !profile) {
      clearOneSignalUser().catch(() => {})
    }
  }, [profile?.id, profile?.org_id, loading, nativePush, featureSwitchesLoading])

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

/** Init OneSignal only for brands still on the legacy relay. */
function OneSignalBootstrap() {
  const { isFeatureEnabled, featureSwitchesLoading } = useOrg()

  useEffect(() => {
    if (featureSwitchesLoading) return
    if (isFeatureEnabled('native_web_push')) return
    initOneSignal().catch(err =>
      console.error('OneSignal init failed:', err)
    )
  }, [featureSwitchesLoading, isFeatureEnabled])

  return null
}

function App() {
  return (
    <AuthProvider>
        <OrgProvider>
          <ThemeProvider>
          <OneSignalBootstrap />
          <PwaUpdateLayer>
          <OfflineBanner />
          <ToastHost />
          <BrowserRouter>
            <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/login" element={<Login />} />
              <Route path="/quote/:token" element={<QuoteAcceptPage />} />
              <Route path="/invoice/:token" element={<InvoiceStatusPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsOfServicePage />} />
              <Route path="/delete-account" element={<DeleteAccountPage />} />
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
                path="/leaderboard"
                element={
                  <ProtectedRoute>
                    <LeaderboardPage />
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
            </Suspense>
          </BrowserRouter>
          </PwaUpdateLayer>
          </ThemeProvider>
        </OrgProvider>
    </AuthProvider>
  )
}

export default App