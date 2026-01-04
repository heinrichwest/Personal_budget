// import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride' // Removed
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTour } from '../contexts/TourContext'
import './Layout.css'

export default function Layout() {
  const { currentUser, userRole, logout, isAdmin, isSystemAdmin } = useAuth()
  const { startTour, currentPageId } = useTour()
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
            <h2>My Life</h2>
            <span className="brand-subtitle">SpecCon Holdings</span>
          </div>
          <div className="nav-links">
            <Link to="/dashboard">Dashboard</Link>
            {isSystemAdmin && (
              <Link to="/tables">Tables</Link>
            )}
            {isAdmin && (
              <Link to="/admin">Admin</Link>
            )}
          </div>
          <div className="nav-user">
            <span className="user-email">{currentUser?.email}</span>
            {userRole && (
              <span className="user-role">{userRole.role}</span>
            )}
            {currentPageId && (
              <button
                onClick={startTour}
                className="btn-outline"
                style={{ marginRight: '0.5rem', borderColor: '#2563eb', color: '#2563eb' }}
              >
                Take Tour
              </button>
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
