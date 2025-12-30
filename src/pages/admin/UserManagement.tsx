import { useEffect, useState } from 'react'
import { collection, getDocs, updateDoc, doc, query, orderBy, addDoc, setDoc } from 'firebase/firestore'
import { db, firebaseConfig } from '../../config/firebase'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'
import './Admin.css'

interface User {
  id: string
  email: string
  role: 'user' | 'admin' | 'systemadmin'
  displayName?: string
  createdAt: Date
}

interface Invite {
  id: string
  email: string
  role: 'user' | 'admin' | 'systemadmin'
  createdAt: any
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  // Invite/Creation State
  const [invites, setInvites] = useState<Invite[]>([])
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin' | 'systemadmin'>('user')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadUsers()
    loadInvites()
  }, [])

  async function loadUsers() {
    try {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      const usersList: User[] = []
      snapshot.forEach((doc) => {
        const data = doc.data()
        usersList.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
        } as User)
      })
      setUsers(usersList)
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadInvites() {
    try {
      const q = query(collection(db, 'role_assignments'))
      const snapshot = await getDocs(q)
      const invitesList: Invite[] = []
      snapshot.forEach((doc) => {
        const data = doc.data()
        invitesList.push({
          id: doc.id,
          ...data
        } as Invite)
      })
      setInvites(invitesList)
    } catch (e) {
      console.error("Error loading invites", e)
    }
  }

  async function updateUserRole(userId: string, newRole: 'user' | 'admin' | 'systemadmin') {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole,
      })
      loadUsers()
    } catch (error) {
      console.error('Error updating user role:', error)
      alert('Failed to update user role')
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    if (!newUserEmail) return
    setCreating(true)

    try {
      // 1. Check if user already exists in active users (Firestore check only)
      const existingUser = users.find(u => u.email.toLowerCase() === newUserEmail.toLowerCase())
      if (existingUser) {
        alert("User already exists in the active user list!")
        setCreating(false)
        return
      }

      // 2. Check if already invited (if no password provided)
      if (!newUserPassword) {
        const existingInvite = invites.find(i => i.email.toLowerCase() === newUserEmail.toLowerCase())
        if (existingInvite) {
          alert("An invite/role assignment already exists for this email.")
          setCreating(false)
          return
        }

        // Create Invite / Assignment
        await addDoc(collection(db, 'role_assignments'), {
          email: newUserEmail.toLowerCase(),
          role: newUserRole,
          createdAt: new Date()
        })

        alert(`Role assigned for ${newUserEmail}. They will have the '${newUserRole}' role when they sign up.`)
      } else {
        // 3. CREATE ACTUAL USER ACCOUNT
        // We must use a secondary app instance to avoid logging out the current admin
        const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp")
        const secondaryAuth = getAuth(secondaryApp)

        try {
          const userCred = await createUserWithEmailAndPassword(secondaryAuth, newUserEmail, newUserPassword)

          // Create the user profile in Firestore
          await setDoc(doc(db, 'users', userCred.user.uid), {
            email: newUserEmail.toLowerCase(),
            role: newUserRole,
            createdAt: new Date(),
            displayName: newUserEmail.split('@')[0]
          })

          alert(`User ${newUserEmail} created successfully with role '${newUserRole}'.`)

        } catch (createError: any) {
          console.error("Error creating user:", createError)
          alert("Failed to create user: " + createError.message)
        } finally {
          // specific cleanup for secondary app
          await deleteApp(secondaryApp)
        }
      }

      setNewUserEmail('')
      setNewUserPassword('')
      loadInvites()
      loadUsers() // Refresh user list if we added one

    } catch (e) {
      console.error("Error adding user/invite", e)
      alert("An unexpected error occurred.")
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading users...</div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="admin-header">
        <h1>User Management</h1>
        <p>Manage users and their roles</p>
      </div>

      {/* ADD USER / ASSIGN ROLE SECTION */}
      <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <h3>Assign Role / Invite User</h3>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Pre-assign a role to a user. If they haven't signed up yet, they will receive this role upon registration.
        </p>
        <form onSubmit={handleAddUser} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
            <label>Email Address</label>
            <input
              type="email"
              required
              className="form-input"
              value={newUserEmail}
              onChange={e => setNewUserEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
            <label>Password (Optional)</label>
            <input
              type="password"
              className="form-input"
              value={newUserPassword}
              onChange={e => setNewUserPassword(e.target.value)}
              placeholder="Create direct account..."
              minLength={6}
            />
            <small style={{ display: 'block', fontSize: '0.7rem', color: '#666', marginTop: '4px' }}>
              Leave blank to send invite/role assignment only.
            </small>
          </div>
          <div className="form-group" style={{ width: '150px' }}>
            <label>Role</label>
            <select
              className="form-select"
              value={newUserRole}
              onChange={e => setNewUserRole(e.target.value as any)}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="systemadmin">System Admin</option>
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={creating} style={{ marginBottom: '2px' }}>
            {creating ? 'Processing...' : newUserPassword ? 'Create Account' : 'Assign Role'}
          </button>
        </form>
      </div>

      {/* PENDING INVITES */}
      {invites.length > 0 && (
        <div className="admin-table-container" style={{ marginBottom: '2rem' }}>
          <h3 style={{ padding: '0 1rem' }}>Pending Assignments</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Assigned Role</th>
                <th>Assigned At</th>
              </tr>
            </thead>
            <tbody>
              {invites.map(invite => (
                <tr key={invite.id}>
                  <td>{invite.email}</td>
                  <td><span className={`role-badge role-${invite.role}`}>{invite.role}</span></td>
                  <td>{invite.createdAt?.toDate ? invite.createdAt.toDate().toLocaleDateString() : 'Recent'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ACTIVE USERS */}
      <div className="admin-table-container">
        <h3 style={{ padding: '0 1rem' }}>Active Users</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Display Name</th>
              <th>Role</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.displayName || '-'}</td>
                <td>
                  <span className={`role-badge role-${user.role}`}>{user.role}</span>
                </td>
                <td>{user.createdAt.toLocaleDateString()}</td>
                <td>
                  <select
                    value={user.role}
                    onChange={(e) =>
                      updateUserRole(user.id, e.target.value as 'user' | 'admin' | 'systemadmin')
                    }
                    className="role-select"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="systemadmin">System Admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
