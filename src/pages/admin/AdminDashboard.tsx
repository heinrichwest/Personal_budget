import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import './Admin.css'

export default function AdminDashboard() {
  const { isSystemAdmin } = useAuth()

  return (
    <div className="container">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <p>System administration and management</p>
      </div>

      <div className="admin-cards">
        <Link to="/admin/users" className="admin-card">
          <div className="admin-card-icon">👥</div>
          <h3>User Management</h3>
          <p>Manage users, roles, and permissions</p>
        </Link>

        <Link to="/admin/mappings" className="admin-card">
          <div className="admin-card-icon">🔗</div>
          <h3>Mapping Management</h3>
          <p>Maintain transaction and category mappings for all users</p>
        </Link>

        {isSystemAdmin && (
          <Link to="/admin/config" className="admin-card">
            <div className="admin-card-icon">⚙️</div>
            <h3>System Configuration</h3>
            <p>Configure system settings and defaults</p>
          </Link>
        )}
      </div>
    </div>
  )
}

