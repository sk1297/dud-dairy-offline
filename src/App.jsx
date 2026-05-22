import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import Toast from './components/Toast.jsx'
import LicenseGate from './components/LicenseGate.jsx'
import AppShell from './components/AppShell.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Delivery from './pages/Delivery.jsx'
import Customers from './pages/Customers.jsx'
import Bills from './pages/Bills.jsx'
import More from './pages/More.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'
import Backup from './pages/Backup.jsx'
import CustomerProfile from './pages/CustomerProfile.jsx'
import Help from './pages/Help.jsx'
import { Capacitor } from '@capacitor/core'

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { user } = useAuth()
  if (user) return <Navigate to="/" replace />
  return children
}

// Root pages — pressing back on these exits the app instead of going back
const ROOT_ROUTES = new Set(['/', '/login'])

function BackButtonHandler() {
  const navigate  = useNavigate()
  const location  = useLocation()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let listener

    const setup = async () => {
      const { App: CapApp } = await import('@capacitor/app')

      listener = await CapApp.addListener('backButton', ({ canGoBack }) => {
        const isRoot = ROOT_ROUTES.has(location.pathname)

        if (isRoot || !canGoBack) {
          // On a root page or no history → exit the app
          CapApp.exitApp()
        } else {
          // Sub-page → go back in React Router history
          navigate(-1)
        }
      })
    }

    setup()

    return () => { listener?.remove() }
  }, [navigate, location.pathname])

  return null
}

function AppRoutes() {
  return (
    <>
      <BackButtonHandler />
      <Toast />
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/*" element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="/"                element={<Dashboard />} />
                <Route path="/delivery"        element={<Delivery />} />
                <Route path="/customers"       element={<Customers />} />
                <Route path="/bills"           element={<Bills />} />
                <Route path="/more"            element={<More />} />
                <Route path="/more/reports"    element={<Reports />} />
                <Route path="/more/settings"   element={<Settings />} />
                <Route path="/more/backup"     element={<Backup />} />
                <Route path="/more/help"       element={<Help />} />
                <Route path="/customers/:id"   element={<CustomerProfile />} />
                <Route path="*"               element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        } />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <LicenseGate>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </LicenseGate>
  )
}
