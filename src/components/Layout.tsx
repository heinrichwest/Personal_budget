import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Layout.css'

export default function Layout() {
  const { currentUser, userRole, logout, isAdmin } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-brand">
            <h2>Personal Budget</h2>
            <span className="brand-subtitle">SpecCon Holdings</span>
          </div>
          <div className="nav-links">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/budget">Budget</Link>
            <Link to="/transactions">Transactions</Link>
            {isAdmin && (
              <Link to="/admin">Admin</Link>
            )}
          </div>
          <div className="nav-user">
            <span className="user-email">{currentUser?.email}</span>
            {userRole && (
              <span className="user-role">{userRole.role}</span>
            )}
            <button onClick={handleLogout} className="btn-outline">Logout</button>
          </div>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

