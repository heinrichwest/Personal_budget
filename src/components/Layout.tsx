import { useState, useEffect } from 'react'
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Layout.css'

export default function Layout() {
  const { currentUser, userRole, logout, isAdmin, isSystemAdmin, completeTour } = useAuth()
  const navigate = useNavigate()
  const [runTour, setRunTour] = useState(false)

  // Tour Steps Configuration
  const tourSteps: Step[] = [
    {
      target: 'body',
      content: <h2>Welcome to My Life!</h2>,
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '.nav-links',
      content: 'Use the navigation bar to switch between major sections like Dashboard, Admin, etc.',
    },
    // Dashboard Specific Steps (Only show if on dashboard)
    // We target IDs we added to Dashboard.tsx
    {
      target: '#tour-budget-card',
      content: 'Track your income, expenses, and analyze your financial health here.',
    },
    {
      target: '#tour-life-card',
      content: 'Manage personal details, medical aid, and family profiles.',
    },
    {
      target: '#tour-insurance-card',
      content: 'Keep track of all your insurance policies in one place.',
    },
    {
      target: '#tour-vault-card',
      content: 'Securely store important passwords and credentials.',
    },
    {
      target: '#tour-assets-card',
      content: 'Log your assets, warranties, and purchase slips.',
    },
    {
      target: '#tour-vehicles-card',
      content: 'Manage your vehicle registrations and service history.',
    },
  ]

  // Check if user has seen tour
  useEffect(() => {
    if (userRole && !userRole.seenTour) {
      // Auto-start tour if not seen
      // Ensure we are on the dashboard so elements exist
      if (window.location.pathname === '/dashboard') {
        setRunTour(true)
      }
    }
  }, [userRole])

  const handleTourCallback = async (data: CallBackProps) => {
    const { status } = data
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status as any)) {
      setRunTour(false)
      await completeTour()
    }
  }

  const startTourManual = () => {
    navigate('/dashboard')
    // Small delay to allow navigation
    setTimeout(() => setRunTour(true), 100)
  }


  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        showSkipButton
        showProgress
        styles={{
          options: {
            primaryColor: '#0052cc',
            zIndex: 10000,
          }
        }}
        callback={handleTourCallback}
      />
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
            <button
              onClick={startTourManual}
              className="btn-outline"
              style={{ marginRight: '0.5rem', borderColor: '#2563eb', color: '#2563eb' }}
            >
              Take Tour
            </button>
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
