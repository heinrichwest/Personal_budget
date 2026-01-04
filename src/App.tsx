import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import BudgetDashboard from './pages/BudgetDashboard'
import LifeDetails from './pages/LifeDetails'
import Documents from './pages/Documents'
import Vehicles from './pages/Vehicles'
import Assets from './pages/Assets'
import Vault from './pages/Vault'
import Insurance from './pages/Insurance'
import Transactions from './pages/Transactions'
import AdminDashboard from './pages/admin/AdminDashboard'
import UserManagement from './pages/admin/UserManagement'
import SystemConfig from './pages/admin/SystemConfig'
import MappingManagement from './pages/admin/MappingManagement'
import Tables from './pages/admin/Tables'
import HowItWorks from './pages/HowItWorks'
import Layout from './components/Layout'
import PasswordChangeModal from './components/PasswordChangeModal'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, mustChangePassword } = useAuth()
  const [passwordChanged, setPasswordChanged] = useState(false)

  if (loading) {
    return <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
  }

  if (!currentUser) {
    return <Navigate to="/login" />
  }

  // Show password change modal if user must change password
  if (mustChangePassword && !passwordChanged) {
    return (
      <>
        <PasswordChangeModal onSuccess={() => setPasswordChanged(true)} />
      </>
    )
  }

  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, isAdmin } = useAuth()

  if (loading) {
    return <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
  }

  if (!currentUser) {
    return <Navigate to="/login" />
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" />
  }

  return <>{children}</>
}

function NavigateToHome() {
  const { isSystemAdmin } = useAuth()
  return <Navigate to={isSystemAdmin ? "/mappings" : "/dashboard"} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<NavigateToHome />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="budget" element={<BudgetDashboard />} />
        <Route path="life-admin" element={<LifeDetails />} />
        <Route path="documents" element={<Documents />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="fleet" element={<Navigate to="/vehicles" replace />} />
        <Route path="assets" element={<Assets />} />
        <Route path="vault" element={<Vault />} />
        <Route path="insurance" element={<Insurance />} />
        <Route path="transactions" element={<Transactions />} />
        <Route
          path="admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="admin/users"
          element={
            <AdminRoute>
              <UserManagement />
            </AdminRoute>
          }
        />
        <Route
          path="admin/config"
          element={
            <AdminRoute>
              <SystemConfig />
            </AdminRoute>
          }
        />
        <Route
          path="admin/mappings"
          element={
            <AdminRoute>
              <MappingManagement />
            </AdminRoute>
          }
        />
        <Route path="mappings" element={<MappingManagement />} />
        <Route path="tables" element={<Tables />} />
        <Route path="how-it-works" element={<HowItWorks />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  )
}

export default App
