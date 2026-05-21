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

function AppRoutes() {
  return (
    <>
      <Toast />
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/*" element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/delivery" element={<Delivery />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/bills" element={<Bills />} />
                <Route path="/more" element={<More />} />
                <Route path="/more/reports" element={<Reports />} />
                <Route path="/more/settings" element={<Settings />} />
                <Route path="/more/backup" element={<Backup />} />
                <Route path="/more/help" element={<Help />} />
                <Route path="/customers/:id" element={<CustomerProfile />} />
                <Route path="*" element={<Navigate to="/" replace />} />
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
